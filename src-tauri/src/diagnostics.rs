use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub status: String,
    pub checked_at: i64,
    pub checks: Vec<HealthCheck>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    pub code: String,
    pub title: String,
    pub status: String,
    pub summary: String,
    pub impact: String,
    pub suggestions: Vec<String>,
}

pub fn inspect(app: &tauri::AppHandle) -> Result<HealthReport, String> {
    let settings = crate::settings::load(app)?;
    let preferred = settings.as_ref().map(|settings| settings.runtime.as_str());
    let runtime = crate::containers::detect_runtime(preferred);
    let mut checks = Vec::new();

    checks.push(check(
        "CONTAINER_RUNTIME",
        "Container runtime",
        if runtime.running { "healthy" } else { "error" },
        &runtime.message,
        if runtime.running {
            "Docker operations are available."
        } else {
            "Projects cannot be started or rebuilt."
        },
        if runtime.installed {
            vec![
                "Start the Docker or Podman daemon.".into(),
                "Verify access to the runtime socket.".into(),
            ]
        } else {
            vec!["Install Docker Engine or Podman.".into()]
        },
    ));
    checks.push(check(
        "COMPOSE_PROVIDER",
        "Compose provider",
        if runtime.compose_available {
            "healthy"
        } else {
            "error"
        },
        if runtime.compose_available {
            "Compose is available."
        } else {
            "No compatible Compose provider was detected."
        },
        if runtime.compose_available {
            "Multi-service stacks can be managed."
        } else {
            "LS Panel cannot create project stacks."
        },
        vec!["Install Docker Compose v2 or podman-compose for the selected runtime.".into()],
    ));

    let gateway = gateway_responds();
    let port_available = TcpListener::bind("127.0.0.1:80").is_ok();
    checks.push(check(
        "LOCAL_GATEWAY",
        "Local gateway",
        if gateway {
            "healthy"
        } else if port_available {
            "warning"
        } else {
            "error"
        },
        if gateway {
            "LS Panel gateway responds on 127.0.0.1:80."
        } else if port_available {
            "Gateway is not running; port 80 is available."
        } else {
            "Port 80 is occupied by another process."
        },
        if gateway {
            "Local .localhost routes are available."
        } else {
            "Local project domains may return an error or open another service."
        },
        if port_available {
            vec!["Start any environment to initialize the gateway.".into()]
        } else {
            vec![
                "Stop the service currently listening on port 80.".into(),
                "Check: sudo ss -ltnp 'sport = :80'".into(),
            ]
        },
    ));

    let https_port_available = TcpListener::bind("127.0.0.1:443").is_ok();
    let https_gateway = https_gateway_responds();
    checks.push(check(
        "HTTPS_GATEWAY",
        "Local HTTPS",
        if https_gateway {
            "healthy"
        } else if https_port_available {
            "warning"
        } else {
            "error"
        },
        if https_gateway {
            "The HTTPS gateway is bound to 127.0.0.1:443."
        } else if https_port_available {
            "HTTPS gateway is not running; port 443 is available."
        } else {
            "Port 443 is occupied by another process."
        },
        "Project HTTPS routes remain local to this computer.",
        if https_port_available {
            vec!["Start any environment to initialize local HTTPS.".into()]
        } else {
            vec!["Check: sudo ss -ltnp 'sport = :443'".into()]
        },
    ));

    let git_version = tool_version("git", &["--version"]);
    let gh_version = tool_version("gh", &["--version"]);
    let npm_version = tool_version("npm", &["--version"]);
    let nvm_installed = nvm_installed();
    let development_tools_ready =
        git_version.is_some() && gh_version.is_some() && npm_version.is_some() && nvm_installed;
    let missing_development_tools = [
        git_version.is_none().then_some("Git"),
        gh_version.is_none().then_some("gh"),
        npm_version.is_none().then_some("npm"),
        (!nvm_installed).then_some("nvm"),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();
    let development_tools_summary = if development_tools_ready {
        "Git, gh, npm and nvm are available.".into()
    } else {
        format!("Missing: {}.", missing_development_tools.join(", "))
    };
    checks.push(check(
        "GIT",
        "Git, GitHub CLI, npm and NVM",
        if development_tools_ready {
            "healthy"
        } else {
            "warning"
        },
        &development_tools_summary,
        "Project source control and Node.js workflows use this development toolset.",
        if development_tools_ready {
            Vec::new()
        } else {
            vec!["Install Git together with gh, npm and nvm.".into()]
        },
    ));

    let openssl_version = tool_version("openssl", &["version"]);
    checks.push(check(
        "OPENSSL",
        "OpenSSL",
        if openssl_version.is_some() {
            "healthy"
        } else {
            "warning"
        },
        openssl_version
            .as_deref()
            .unwrap_or("OpenSSL was not found on PATH."),
        "Generating the local certificate authority and per-site HTTPS certificates requires OpenSSL.",
        if openssl_version.is_none() {
            vec!["Install OpenSSL (e.g. apt install openssl).".into()]
        } else {
            Vec::new()
        },
    ));

    let certutil_version = tool_version("certutil", &["--version"]);
    checks.push(check(
        "NSS_TOOLS",
        "NSS tools (certutil)",
        if certutil_version.is_some() {
            "healthy"
        } else {
            "warning"
        },
        certutil_version
            .as_deref()
            .unwrap_or("certutil was not found on PATH."),
        "Needed to trust the local CA in Firefox and other NSS-based browsers; Chromium-based browsers use the system trust store instead.",
        if certutil_version.is_none() {
            vec!["Install NSS tools (e.g. apt install libnss3-tools).".into()]
        } else {
            Vec::new()
        },
    ));

    let ca_exists = crate::tls::ca_path(app).is_ok_and(|path| path.is_file());
    let ca_trusted = crate::tls::trusted(app);
    let browsers_trusted = crate::tls::browsers_trusted();
    let (ca_expiry, certificate_expiry) = crate::tls::expiry(app);
    let trust_summary = if ca_trusted && browsers_trusted {
        "LS Panel Local CA is trusted by the system and detected browser stores."
    } else if ca_trusted {
        "The local CA is trusted by the system but is missing from a browser certificate store."
    } else if ca_exists {
        "The local CA exists but is not trusted by the system yet."
    } else {
        "The local CA will be generated when the first project starts."
    };
    let expiry_summary = [
        ca_expiry.map(|value| format!("CA expires: {value}.")),
        certificate_expiry.map(|value| format!("HTTPS certificate expires: {value}.")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ");
    let ca_summary = if expiry_summary.is_empty() {
        trust_summary.into()
    } else {
        format!("{trust_summary} {expiry_summary}")
    };
    checks.push(check(
        "LOCAL_CA",
        "Local certificate authority",
        if ca_trusted && browsers_trusted {
            "healthy"
        } else {
            "warning"
        },
        &ca_summary,
        if ca_trusted && browsers_trusted {
            "Local project HTTPS can be verified without certificate warnings."
        } else {
            "Browsers may show a certificate warning until the CA is installed."
        },
        if ca_exists && (!ca_trusted || !browsers_trusted) {
            vec!["Install the local CA using the action below.".into()]
        } else {
            Vec::new()
        },
    ));

    if let Some(settings) = settings {
        checks.push(directory_check(Path::new(&settings.sites_directory)));
        checks.push(disk_check(Path::new(&settings.sites_directory)));
    } else {
        checks.push(check(
            "SITES_DIRECTORY",
            "Sites directory",
            "warning",
            "Initial setup is not complete.",
            "Projects do not have a storage directory.",
            vec!["Complete the welcome setup.".into()],
        ));
    }

    let status = if checks.iter().any(|item| item.status == "error") {
        "error"
    } else if checks.iter().any(|item| item.status == "warning") {
        "warning"
    } else {
        "healthy"
    };
    let checked_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    Ok(HealthReport {
        status: status.into(),
        checked_at,
        checks,
    })
}

fn directory_check(path: &Path) -> HealthCheck {
    if !path.is_dir() {
        return check(
            "SITES_DIRECTORY",
            "Sites directory",
            "error",
            "The configured directory does not exist.",
            "Projects cannot be created or restored.",
            vec!["Choose an existing writable directory in Settings → System.".into()],
        );
    }
    let probe = path.join(format!(".lspanel-write-test-{}", std::process::id()));
    match fs::write(&probe, b"test") {
        Ok(()) => {
            let _ = fs::remove_file(probe);
            check(
                "SITES_DIRECTORY",
                "Sites directory",
                "healthy",
                &format!("{} is writable.", path.display()),
                "Project files can be created.",
                Vec::new(),
            )
        }
        Err(error) => check(
            "SITES_DIRECTORY",
            "Sites directory",
            "error",
            &format!("Directory is not writable: {error}"),
            "Project creation and generated configuration will fail.",
            vec!["Fix ownership or choose another directory.".into()],
        ),
    }
}

fn disk_check(path: &Path) -> HealthCheck {
    let output = Command::new("df")
        .args(["-Pk", &path.display().to_string()])
        .stdin(Stdio::null())
        .output();
    let available_kb = output
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .and_then(|text| {
            text.lines()
                .nth(1)
                .and_then(|line| line.split_whitespace().nth(3))
                .and_then(|value| value.parse::<u64>().ok())
        });
    let Some(available_kb) = available_kb else {
        return check(
            "DISK_SPACE",
            "Disk space",
            "warning",
            "Available disk space could not be determined.",
            "Image pulls and builds may fail if the disk is full.",
            vec!["Run df -h for the sites directory.".into()],
        );
    };
    let gib = available_kb as f64 / 1024.0 / 1024.0;
    let status = if gib < 0.5 {
        "error"
    } else if gib < 2.0 {
        "warning"
    } else {
        "healthy"
    };
    check(
        "DISK_SPACE",
        "Disk space",
        status,
        &format!("{gib:.1} GiB available."),
        if status == "healthy" {
            "There is enough space for ordinary local builds."
        } else {
            "Container image pulls, builds, and database volumes may fail."
        },
        vec!["Remove unused Docker images and build cache after reviewing them.".into()],
    )
}

fn gateway_responds() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], 80));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    if stream
        .write_all(b"GET / HTTP/1.1\r\nHost: healthcheck.invalid\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.contains("LS Panel")
        && response.starts_with("HTTP/1.1 404")
}

/// `https_port_available` alone only proves *something* is bound to 443, and
/// `gateway_responds()` says nothing about port 443 at all since it only
/// probes plain HTTP on port 80 - combining the two the way the HTTP check
/// does could report "healthy" for HTTPS while an unrelated process (or a
/// stale container) squats on 443 instead of the real gateway. This probes
/// port 443 over an actual TLS connection and checks that the response is
/// really the LS Panel gateway's fallback page.
fn https_gateway_responds() -> bool {
    let Ok(mut child) = Command::new("openssl")
        .args([
            "s_client",
            "-connect",
            "127.0.0.1:443",
            "-servername",
            "healthcheck.invalid",
            "-quiet",
            "-verify_quiet",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin
            .write_all(b"GET / HTTP/1.1\r\nHost: healthcheck.invalid\r\nConnection: close\r\n\r\n");
    }
    let Ok(output) =
        crate::process::child_output(child, Duration::from_secs(2), "HTTPS gateway probe")
    else {
        return false;
    };
    let response = String::from_utf8_lossy(&output.stdout);
    response.contains("LS Panel") && response.contains("HTTP/1.1 404")
}

/// Reports whether a CLI tool is installed by attempting to spawn it.
/// Presence is proven by the OS successfully exec'ing the binary — the exit
/// code is not a reliable "installed" signal on its own: NSS's `certutil`,
/// for example, exits 1 and prints a usage banner for `--version` since it
/// doesn't recognize that flag, even though the tool is fully installed.
fn tool_version(command: &str, version_args: &[&str]) -> Option<String> {
    let output = Command::new(command)
        .args(version_args)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    let version_line = [&output.stdout, &output.stderr]
        .into_iter()
        .find_map(|stream| {
            String::from_utf8_lossy(stream)
                .lines()
                .next()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_owned)
        });
    Some(version_line.unwrap_or_else(|| "Installed".into()))
}

fn nvm_installed() -> bool {
    let configured = std::env::var_os("NVM_DIR").map(PathBuf::from);
    let xdg = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .map(|path| path.join("nvm"));
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|path| path.join(".nvm"));
    [configured, xdg, home]
        .into_iter()
        .flatten()
        .any(|directory| directory.join("nvm.sh").is_file())
}

fn check(
    code: &str,
    title: &str,
    status: &str,
    summary: &str,
    impact: &str,
    suggestions: Vec<String>,
) -> HealthCheck {
    HealthCheck {
        code: code.into(),
        title: title.into(),
        status: status.into(),
        summary: summary.into(),
        impact: impact.into(),
        suggestions,
    }
}

pub fn inspect_project(app: &tauri::AppHandle, site_id: &str) -> Result<HealthReport, String> {
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Environment not found")?;
    if environment.runtime_mode == "native" {
        return Ok(inspect_native_project(&environment));
    }
    let mut checks = Vec::new();
    let started = Instant::now();
    checks.push(match local_site_response(&site.domain) {
        Ok(response) => {
            let headers = [
                response.server.map(|value| format!("Server: {value}")),
                response
                    .content_type
                    .map(|value| format!("Content-Type: {value}")),
                response.location.map(|value| format!("Location: {value}")),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" · ");
            check(
                "PROJECT_HTTP",
                "Local URL and response headers",
                if (200..400).contains(&response.status) {
                    "healthy"
                } else {
                    "error"
                },
                &format!(
                    "HTTP {} in {} ms. {}",
                    response.status,
                    started.elapsed().as_millis(),
                    headers
                ),
                "Checks the project through its real local domain and gateway headers.",
                vec![],
            )
        }
        Err(error) => check(
            "PROJECT_HTTP",
            "Local URL",
            "error",
            &error,
            "The local project route is unavailable.",
            vec!["Start the environment and inspect web logs.".into()],
        ),
    });
    let resolved = (site.domain.as_str(), 443)
        .to_socket_addrs()
        .map(|addresses| addresses.collect::<Vec<_>>());
    checks.push(match resolved {
        Ok(addresses) if addresses.iter().any(|address| address.ip().is_loopback()) => check(
            "PROJECT_DNS",
            "Local domain resolution",
            "healthy",
            &format!("{} resolves to a loopback address.", site.domain),
            "Requests remain on this computer.",
            vec![],
        ),
        Ok(_) => check(
            "PROJECT_DNS",
            "Local domain resolution",
            "error",
            &format!("{} does not resolve to loopback.", site.domain),
            "The browser may connect to another host.",
            vec!["Use a .localhost domain or repair the local resolver.".into()],
        ),
        Err(error) => check(
            "PROJECT_DNS",
            "Local domain resolution",
            "warning",
            &format!("System resolver check failed: {error}"),
            ".localhost remains browser-reserved, but command-line tools may fail to resolve it.",
            vec!["Check getent hosts for the project domain.".into()],
        ),
    });
    checks.push(match crate::tls::status(app) {
        Ok(status)
            if status.certificate_exists
                && status.domains.iter().any(|domain| domain == &site.domain) =>
        {
            check(
                "PROJECT_SSL",
                "HTTPS certificate",
                if status.system_trusted && status.browsers_trusted {
                    "healthy"
                } else {
                    "warning"
                },
                &format!(
                    "Certificate covers {} and expires {}.",
                    site.domain,
                    status
                        .certificate_expires
                        .as_deref()
                        .unwrap_or("at an unknown time")
                ),
                "The project domain is included in the local certificate SAN list.",
                if status.system_trusted && status.browsers_trusted {
                    vec![]
                } else {
                    vec!["Install the LS Panel Local CA in missing trust stores.".into()]
                },
            )
        }
        Ok(_) => check(
            "PROJECT_SSL",
            "HTTPS certificate",
            "error",
            "The active local certificate does not cover this project domain.",
            "HTTPS clients will reject the hostname.",
            vec!["Reissue the local HTTPS certificate from Certificates.".into()],
        ),
        Err(error) => check(
            "PROJECT_SSL",
            "HTTPS certificate",
            "error",
            &error,
            "HTTPS certificate state could not be inspected.",
            vec!["Open Certificates and run diagnostics.".into()],
        ),
    });
    checks.push(match crate::backups::info(app, &environment.id) {
        Ok(info) => check(
            "PROJECT_DATABASE",
            "Database connection",
            "healthy",
            &format!(
                "Connected to {} {}. Size: {}.",
                info.engine, info.version, info.size
            ),
            "Generated database credentials work.",
            vec![],
        ),
        Err(error) => check(
            "PROJECT_DATABASE",
            "Database connection",
            "error",
            &error,
            "Database-backed features may fail.",
            vec!["Check database health and credentials.".into()],
        ),
    });
    if environment
        .extra_services
        .iter()
        .any(|service| service == "redis")
    {
        let mut command = vec!["redis-cli".into()];
        if !environment.redis_password.is_empty() {
            command.extend(["-a".into(), environment.redis_password.clone()])
        }
        command.push("ping".into());
        checks.push(
            match crate::containers::execute_service_command(app, &environment.id, "redis", command)
            {
                Ok(output) if output.to_uppercase().contains("PONG") => check(
                    "PROJECT_REDIS",
                    "Redis connection",
                    "healthy",
                    "Redis responded with PONG.",
                    "Cache and queues are available.",
                    vec![],
                ),
                Ok(output) => check(
                    "PROJECT_REDIS",
                    "Redis connection",
                    "warning",
                    output.trim(),
                    "Redis returned an unexpected response.",
                    vec![],
                ),
                Err(error) => check(
                    "PROJECT_REDIS",
                    "Redis connection",
                    "error",
                    &error,
                    "Cache and queue operations may fail.",
                    vec!["Verify Redis health and password.".into()],
                ),
            },
        );
    }
    if environment
        .extra_services
        .iter()
        .any(|service| service == "mailpit")
    {
        let service = if environment.web_server == "Nginx" {
            "php"
        } else {
            "web"
        };
        let command=vec!["php".into(),"-r".into(),"$s=@fsockopen('mailpit',1025,$e,$m,3);if(!$s){fwrite(STDERR,$m);exit(1);}echo 'SMTP ready';fclose($s);".into()];
        checks.push(
            match crate::containers::execute_service_command(app, &environment.id, service, command)
            {
                Ok(_) => check(
                    "PROJECT_SMTP",
                    "Mailpit SMTP",
                    "healthy",
                    "Connected to mailpit:1025.",
                    "Local mail capture is available.",
                    vec![],
                ),
                Err(error) => check(
                    "PROJECT_SMTP",
                    "Mailpit SMTP",
                    "error",
                    &error,
                    "Local mail delivery will fail.",
                    vec!["Start Mailpit and inspect its logs.".into()],
                ),
            },
        );
    }
    let status = if checks.iter().any(|item| item.status == "error") {
        "error"
    } else if checks.iter().any(|item| item.status == "warning") {
        "warning"
    } else {
        "healthy"
    };
    Ok(HealthReport {
        status: status.into(),
        checked_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64,
        checks,
    })
}

fn inspect_native_project(environment: &crate::containers::Environment) -> HealthReport {
    let started = Instant::now();
    let port: u16 = environment.port.parse().unwrap_or(0);
    let check_item = match local_response(port, "127.0.0.1") {
        Ok(response) => check(
            "PROJECT_HTTP",
            "Local process response",
            if (200..400).contains(&response.status) {
                "healthy"
            } else {
                "error"
            },
            &format!(
                "HTTP {} in {} ms.",
                response.status,
                started.elapsed().as_millis()
            ),
            "Checks the native process directly on 127.0.0.1, without a container gateway.",
            vec![],
        ),
        Err(error) => check(
            "PROJECT_HTTP",
            "Local process response",
            "error",
            &error,
            "The native process is not reachable on its configured port.",
            vec!["Start the environment and check its logs.".into()],
        ),
    };
    let status = if check_item.status == "error" {
        "error"
    } else {
        "healthy"
    };
    HealthReport {
        status: status.into(),
        checked_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64,
        checks: vec![check_item],
    }
}

struct LocalResponse {
    status: u16,
    server: Option<String>,
    content_type: Option<String>,
    location: Option<String>,
}

fn local_site_response(host: &str) -> Result<LocalResponse, String> {
    local_response(80, host)
}

fn local_response(port: u16, host: &str) -> Result<LocalResponse, String> {
    let mut stream = TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_secs(2),
    )
    .map_err(|error| format!("Connection failed: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|error| error.to_string())?;
    stream
        .write_all(
            format!("GET / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n").as_bytes(),
        )
        .map_err(|error| error.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    let status = response
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse().ok())
        .ok_or("Invalid HTTP response")?;
    let header = |name: &str| {
        response.lines().skip(1).find_map(|line| {
            let (key, value) = line.split_once(':')?;
            key.eq_ignore_ascii_case(name)
                .then(|| value.trim().to_owned())
        })
    };
    Ok(LocalResponse {
        status,
        server: header("server"),
        content_type: header("content-type"),
        location: header("location"),
    })
}

#[cfg(test)]
mod tests {
    use super::https_gateway_responds;
    use std::net::TcpListener;

    #[test]
    fn reports_no_https_gateway_when_nothing_is_listening_on_443() {
        // Regression test: this must actually verify TLS on port 443 rather
        // than inferring it from an unrelated plain-HTTP check on port 80
        // combined with "port 443 merely isn't free to bind" - the old logic
        // could report "healthy" while an unrelated process, not the real
        // gateway, held port 443.
        //
        // This only means anything when port 443 is actually free on the
        // machine running the test - on a dev machine with LS Panel's own
        // gateway already up, something genuinely is listening there and
        // responding correctly, so there's nothing to regress-test.
        if TcpListener::bind("127.0.0.1:443").is_ok() {
            assert!(!https_gateway_responds());
        }
    }
}
