use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{LazyLock, Mutex},
};
use tauri::Manager;

/// Serializes certificate generation. All environments share the same
/// `certificates/` directory and the same temporary filenames
/// (`local.key.next`, `local.crt.next`, `local.ext`) while a new leaf
/// certificate is being generated — two environments starting at the same
/// time could otherwise interleave their openssl runs and end up with a
/// mixed cert/key pair.
static TLS_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

pub struct CertificatePaths {
    pub certificate: PathBuf,
    pub key: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateStatus {
    pub ca_exists: bool,
    pub certificate_exists: bool,
    pub system_trusted: bool,
    pub browsers_trusted: bool,
    pub ca_expires: Option<String>,
    pub certificate_expires: Option<String>,
    pub ca_fingerprint: Option<String>,
    pub certificate_fingerprint: Option<String>,
    pub domains: Vec<String>,
    pub ca_path: String,
    pub certificate_path: String,
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("certificates"))
        .map_err(|error| error.to_string())
}

fn run(program: &str, args: &[&str], directory: &Path) -> Result<(), String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(directory)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to launch {program}: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        Err(if detail.is_empty() {
            format!("{program} failed")
        } else {
            detail
        })
    }
}

pub fn ensure(
    app: &tauri::AppHandle,
    hostnames: impl IntoIterator<Item = String>,
) -> Result<CertificatePaths, String> {
    let _lock = TLS_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let directory = root(app)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let ca_key = directory.join("lspanel-ca.key");
    let ca_certificate = directory.join("lspanel-ca.crt");
    if !ca_key.is_file() || !ca_certificate.is_file() {
        run(
            "openssl",
            &[
                "req",
                "-x509",
                "-newkey",
                "rsa:3072",
                "-sha256",
                "-nodes",
                "-keyout",
                "lspanel-ca.key",
                "-out",
                "lspanel-ca.crt",
                "-days",
                "3650",
                "-subj",
                "/CN=LS Panel Local CA",
                "-addext",
                "basicConstraints=critical,CA:TRUE",
                "-addext",
                "keyUsage=critical,keyCertSign,cRLSign",
            ],
            &directory,
        )?;
        set_private_permissions(&ca_key)?;
    }

    let mut names = hostnames.into_iter().collect::<Vec<_>>();
    names.sort();
    names.dedup();
    if names.is_empty() || names.iter().any(|name| !safe_hostname(name)) {
        return Err("Cannot create HTTPS certificate for invalid local domains".into());
    }
    let names_text = names.join("\n") + "\n";
    let names_path = directory.join("domains.txt");
    let certificate = directory.join("local.crt");
    let key = directory.join("local.key");
    let current_names = fs::read_to_string(&names_path).unwrap_or_default();
    if certificate.is_file()
        && key.is_file()
        && current_names == names_text
        && certificate_matches_key(&certificate, &key)
    {
        return Ok(CertificatePaths { certificate, key });
    }

    let mut extension = String::from(
        "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=",
    );
    extension.push_str(
        &names
            .iter()
            .map(|name| format!("DNS:{name}"))
            .collect::<Vec<_>>()
            .join(","),
    );
    extension.push('\n');
    fs::write(directory.join("local.ext"), extension).map_err(|error| error.to_string())?;
    run(
        "openssl",
        &[
            "req",
            "-newkey",
            "rsa:2048",
            "-sha256",
            "-nodes",
            "-keyout",
            "local.key.next",
            "-out",
            "local.csr",
            "-subj",
            "/CN=LS Panel Local HTTPS",
        ],
        &directory,
    )?;
    run(
        "openssl",
        &[
            "x509",
            "-req",
            "-sha256",
            "-in",
            "local.csr",
            "-CA",
            "lspanel-ca.crt",
            "-CAkey",
            "lspanel-ca.key",
            "-CAcreateserial",
            "-out",
            "local.crt.next",
            "-days",
            "825",
            "-extfile",
            "local.ext",
        ],
        &directory,
    )?;
    fs::rename(directory.join("local.key.next"), &key).map_err(|error| error.to_string())?;
    fs::rename(directory.join("local.crt.next"), &certificate)
        .map_err(|error| error.to_string())?;
    set_private_permissions(&key)?;
    fs::write(names_path, names_text).map_err(|error| error.to_string())?;
    let _ = fs::remove_file(directory.join("local.csr"));
    let _ = fs::remove_file(directory.join("local.ext"));
    Ok(CertificatePaths { certificate, key })
}

pub fn ca_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(root(app)?.join("lspanel-ca.crt"))
}

pub fn expiry(app: &tauri::AppHandle) -> (Option<String>, Option<String>) {
    let Ok(directory) = root(app) else {
        return (None, None);
    };
    (
        certificate_end_date(&directory.join("lspanel-ca.crt")),
        certificate_end_date(&directory.join("local.crt")),
    )
}

pub fn status(app: &tauri::AppHandle) -> Result<CertificateStatus, String> {
    let directory = root(app)?;
    let ca = directory.join("lspanel-ca.crt");
    let certificate = directory.join("local.crt");
    let (ca_expires, certificate_expires) = expiry(app);
    let domains = fs::read_to_string(directory.join("domains.txt"))
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|domain| !domain.is_empty())
        .map(str::to_owned)
        .collect();
    Ok(CertificateStatus {
        ca_exists: ca.is_file(),
        certificate_exists: certificate.is_file(),
        system_trusted: trusted(app),
        browsers_trusted: browsers_trusted(),
        ca_expires,
        certificate_expires,
        ca_fingerprint: certificate_fingerprint(&ca),
        certificate_fingerprint: certificate_fingerprint(&certificate),
        domains,
        ca_path: ca.display().to_string(),
        certificate_path: certificate.display().to_string(),
    })
}

fn certificate_end_date(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let output = Command::new("openssl")
        .args(["x509", "-noout", "-enddate", "-in"])
        .arg(path)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    output.status.success().then(|| {
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .strip_prefix("notAfter=")
            .unwrap_or_default()
            .to_owned()
    })
}

fn modulus(program: &str, args: &[&str], path: &Path) -> Option<String> {
    let output = Command::new(program)
        .args(args)
        .arg(path)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|value| !value.is_empty())
}

/// The certificate and key are written by two separate, non-atomic renames
/// (see `ensure` below); a crash between them — or any other cause of the
/// two files going out of sync — leaves a mismatched pair on disk that
/// existence checks alone can't detect. Comparing the RSA modulus catches
/// that case so `ensure`'s fast path regenerates instead of silently
/// serving a certificate that TLS handshakes will reject.
fn certificate_matches_key(certificate: &Path, key: &Path) -> bool {
    let certificate_modulus = modulus(
        "openssl",
        &["x509", "-noout", "-modulus", "-in"],
        certificate,
    );
    let key_modulus = modulus("openssl", &["rsa", "-noout", "-modulus", "-in"], key);
    matches!((certificate_modulus, key_modulus), (Some(a), Some(b)) if a == b)
}

fn certificate_fingerprint(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let output = Command::new("openssl")
        .args(["x509", "-noout", "-fingerprint", "-sha256", "-in"])
        .arg(path)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    output.status.success().then(|| {
        let raw = String::from_utf8_lossy(&output.stdout);
        raw.trim()
            .strip_prefix("sha256 Fingerprint=")
            .or_else(|| raw.trim().strip_prefix("SHA256 Fingerprint="))
            .unwrap_or_default()
            .to_owned()
    })
}

pub fn force_reissue(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = root(app)?;
    for name in ["local.crt", "local.key", "domains.txt"] {
        let path = directory.join(name);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Failed to remove {}: {error}", path.display()))?;
        }
    }
    Ok(())
}

pub fn remove_server_certificate(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = root(app)?;
    for name in [
        "local.crt",
        "local.key",
        "domains.txt",
        "local.csr",
        "local.ext",
    ] {
        let path = directory.join(name);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Failed to remove {}: {error}", path.display()))?;
        }
    }
    Ok(())
}

pub fn reset_ca(app: &tauri::AppHandle) -> Result<(), String> {
    for store in browser_stores() {
        let database = format!("sql:{}", store.display());
        let _ = Command::new("certutil")
            .args(["-D", "-d", &database, "-n", "LS Panel Local CA"])
            .stdin(Stdio::null())
            .output();
    }
    let installed = Path::new("/usr/local/share/ca-certificates/lspanel-local-ca.crt");
    if installed.exists() {
        run_privileged(
            "/usr/bin/rm",
            &[installed.to_str().ok_or("Invalid CA path")?],
        )?;
        run_privileged("/usr/sbin/update-ca-certificates", &[])?;
    }
    let directory = root(app)?;
    for name in [
        "lspanel-ca.crt",
        "lspanel-ca.key",
        "lspanel-ca.srl",
        "local.crt",
        "local.key",
        "domains.txt",
    ] {
        let path = directory.join(name);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Failed to remove {}: {error}", path.display()))?;
        }
    }
    Ok(())
}

pub fn trusted(app: &tauri::AppHandle) -> bool {
    let Ok(certificate) = ca_path(app) else {
        return false;
    };
    certificate.is_file()
        && Command::new("openssl")
            .args(["verify", "-CApath", "/etc/ssl/certs"])
            .arg(&certificate)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
}

pub fn browsers_trusted() -> bool {
    let stores = browser_stores();
    !stores.is_empty()
        && stores.iter().all(|store| {
            Command::new("certutil")
                .args(["-L", "-d"])
                .arg(format!("sql:{}", store.display()))
                .args(["-n", "LS Panel Local CA"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok_and(|status| status.success())
        })
}

pub fn install_ca(app: &tauri::AppHandle) -> Result<(), String> {
    let certificate = ca_path(app)?;
    if !certificate.is_file() {
        return Err("Start a project once to generate the local CA".into());
    }
    let source = certificate.to_str().ok_or("Invalid CA certificate path")?;
    if Path::new("/usr/sbin/update-ca-certificates").is_file() {
        run_privileged(
            "/usr/bin/install",
            &[
                "-m",
                "0644",
                source,
                "/usr/local/share/ca-certificates/lspanel-local-ca.crt",
            ],
        )?;
        run_privileged("/usr/sbin/update-ca-certificates", &[])?;
        return install_browser_ca(&certificate);
    }
    if Path::new("/usr/bin/trust").is_file() {
        run_privileged("/usr/bin/trust", &["anchor", source])?;
        return install_browser_ca(&certificate);
    }
    Err(
        "No supported system CA installer was found (update-ca-certificates or p11-kit trust)"
            .into(),
    )
}

fn install_browser_ca(certificate: &Path) -> Result<(), String> {
    let stores = browser_stores();
    if stores.is_empty() {
        return Ok(());
    }
    if !Path::new("/usr/bin/certutil").is_file() {
        return Err(
            "System CA was installed, but browser trust requires certutil (install libnss3-tools)"
                .into(),
        );
    }
    for store in stores {
        let database = format!("sql:{}", store.display());
        let exists = Command::new("certutil")
            .args(["-L", "-d", &database, "-n", "LS Panel Local CA"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success());
        if exists {
            let _ = Command::new("certutil")
                .args(["-D", "-d", &database, "-n", "LS Panel Local CA"])
                .stdin(Stdio::null())
                .output();
        }
        let output = Command::new("certutil")
            .args([
                "-A",
                "-d",
                &database,
                "-n",
                "LS Panel Local CA",
                "-t",
                "C,,",
                "-i",
            ])
            .arg(certificate)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| format!("Failed to launch certutil: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "System CA was installed, but browser CA import failed for {}: {}",
                store.display(),
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
    }
    Ok(())
}

fn browser_stores() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    browser_stores_in(&home)
}

/// Best-effort: creates an empty NSS certificate database at `path` (matching
/// what Chrome would create on first launch) so the CA can be imported before
/// Chrome has ever run. Returns false (and leaves the caller to skip this
/// store) if certutil is missing or creation fails for any reason.
fn create_nssdb(path: &Path) -> bool {
    if path.join("cert9.db").is_file() {
        return true;
    }
    if !Path::new("/usr/bin/certutil").is_file() {
        return false;
    }
    let Ok(()) = fs::create_dir_all(path) else {
        return false;
    };
    Command::new("certutil")
        .args([
            "-N",
            "-d",
            &format!("sql:{}", path.display()),
            "--empty-password",
        ])
        .stdin(Stdio::null())
        .output()
        .is_ok_and(|output| output.status.success())
}

fn browser_stores_in(home: &Path) -> Vec<PathBuf> {
    let mut stores = Vec::new();
    // Unlike Firefox's randomized profile directory, `~/.pki/nssdb` is the one
    // fixed, well-known path Chrome (and any other NSS-aware app) reads for
    // user-imported CAs — so, unlike Firefox, it's worth creating up front
    // rather than only importing into it once Chrome happens to have created
    // it first. Without this, running the installer before Chrome's first
    // launch silently skipped it (empty store list, nothing to import into),
    // reporting success while never actually trusting the CA in the browser.
    let chrome = home.join(".pki/nssdb");
    if chrome.join("cert9.db").is_file() || create_nssdb(&chrome) {
        stores.push(chrome);
    }

    // Firefox keeps its NSS database outside ~/.mozilla when installed through
    // Snap or Flatpak. Import into every existing profile so changing profiles
    // does not unexpectedly bring the certificate warning back.
    for firefox in [
        home.join(".mozilla/firefox"),
        home.join("snap/firefox/common/.mozilla/firefox"),
        home.join(".var/app/org.mozilla.firefox/.mozilla/firefox"),
    ] {
        if let Ok(entries) = fs::read_dir(firefox) {
            stores.extend(
                entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.path())
                    .filter(|path| path.is_dir() && path.join("cert9.db").is_file()),
            );
        }
    }
    stores.sort();
    stores.dedup();
    stores
}

fn run_privileged(program: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new("pkexec")
        .arg(program)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to request administrator permission: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        Err(if detail.is_empty() {
            format!(
                "Administrator action {} exited with status {}. The authentication prompt may have been cancelled.",
                program,
                output.status.code().map_or_else(|| "unknown".into(), |code| code.to_string())
            )
        } else {
            format!("Administrator action {program} failed: {detail}")
        })
    }
}

fn safe_hostname(value: &str) -> bool {
    let value = value.strip_prefix("*.").unwrap_or(value);
    value.ends_with(".localhost")
        && value.split('.').all(|part| {
            !part.is_empty()
                && part.len() <= 63
                && part
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
                && !part.starts_with('-')
                && !part.ends_with('-')
        })
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{browser_stores_in, certificate_matches_key, create_nssdb, safe_hostname};
    use std::fs;
    use std::process::{Command, Stdio};

    #[test]
    fn certificates_accept_only_safe_localhost_names() {
        assert!(safe_hostname("demo.localhost"));
        assert!(safe_hostname("api.demo.localhost"));
        assert!(safe_hostname("*.demo.localhost"));
        assert!(!safe_hostname("*.*.demo.localhost"));
        assert!(!safe_hostname("demo.test"));
        assert!(!safe_hostname("-demo.localhost"));
        assert!(!safe_hostname("demo/../../x.localhost"));
    }

    #[test]
    fn browser_stores_include_native_snap_and_flatpak_firefox_profiles() {
        let home =
            std::env::temp_dir().join(format!("lspanel-browser-stores-{}", std::process::id()));
        let expected = [
            home.join(".pki/nssdb"),
            home.join(".mozilla/firefox/native.default"),
            home.join("snap/firefox/common/.mozilla/firefox/snap.default"),
            home.join(".var/app/org.mozilla.firefox/.mozilla/firefox/flatpak.default"),
        ];
        for store in &expected {
            fs::create_dir_all(store).unwrap();
            fs::write(store.join("cert9.db"), []).unwrap();
        }

        let stores = browser_stores_in(&home);
        for store in expected {
            assert!(stores.contains(&store), "missing {}", store.display());
        }
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn create_nssdb_is_a_noop_when_a_database_already_exists() {
        let path = std::env::temp_dir().join(format!("lspanel-nssdb-noop-{}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("cert9.db"), []).unwrap();
        assert!(create_nssdb(&path));
        fs::remove_dir_all(path).unwrap();
    }

    #[test]
    #[ignore = "requires the certutil binary (libnss3-tools)"]
    fn create_nssdb_creates_a_real_database_on_a_fresh_directory() {
        // Regression test: on a machine where Chrome had never been
        // launched, ~/.pki/nssdb didn't exist yet, so the CA installer's
        // browser-store list came back empty and it silently reported
        // success without ever importing the CA anywhere.
        let path = std::env::temp_dir().join(format!("lspanel-nssdb-fresh-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        assert!(create_nssdb(&path));
        assert!(path.join("cert9.db").is_file());
        fs::remove_dir_all(path).unwrap();
    }

    fn generate_self_signed(directory: &std::path::Path, key: &str, certificate: &str) {
        let status = Command::new("openssl")
            .args([
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-sha256",
                "-nodes",
                "-keyout",
                key,
                "-out",
                certificate,
                "-days",
                "1",
                "-subj",
                "/CN=test",
            ])
            .current_dir(directory)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[test]
    fn certificate_matches_key_accepts_a_genuine_pair_and_rejects_a_mismatched_one() {
        // Regression test: `ensure` writes the certificate and key with two
        // separate renames, which can leave a mismatched pair on disk if
        // interrupted between them. The fast path must detect that instead
        // of trusting file existence alone.
        let directory = std::env::temp_dir().join(format!(
            "lspanel-cert-match-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        generate_self_signed(&directory, "a.key", "a.crt");
        generate_self_signed(&directory, "b.key", "b.crt");
        assert!(certificate_matches_key(
            &directory.join("a.crt"),
            &directory.join("a.key")
        ));
        assert!(!certificate_matches_key(
            &directory.join("a.crt"),
            &directory.join("b.key")
        ));
        fs::remove_dir_all(directory).unwrap();
    }
}
