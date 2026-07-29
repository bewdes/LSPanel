use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener},
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use tauri::Manager;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveLinkConfig {
    #[serde(default)]
    links: Vec<LiveLinkEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    site_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mode: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveLinkEntry {
    pub site_id: String,
    pub mode: String,
    pub port: u16,
    pub local_port: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveLinkStatus {
    pub installed: bool,
    pub connected: bool,
    pub serve_enabled: bool,
    pub version: Option<String>,
    pub dns_name: Option<String>,
    pub enable_url: Option<String>,
    pub active: bool,
    pub site_id: Option<String>,
    pub mode: Option<String>,
    pub url: Option<String>,
    pub links: Vec<LiveLinkStatusEntry>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveLinkStatusEntry {
    pub site_id: String,
    pub mode: String,
    pub port: u16,
    pub local_port: u16,
    pub tailscale_active: bool,
    pub gateway_active: bool,
    pub project_reachable: bool,
    pub status: String,
}

fn config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("livelink.json"))
        .map_err(|error| error.to_string())
}

fn load_config(app: &tauri::AppHandle) -> Option<LiveLinkConfig> {
    let contents = fs::read_to_string(config_path(app).ok()?).ok()?;
    let mut config = serde_json::from_str::<LiveLinkConfig>(&contents).ok()?;
    if config.links.is_empty() {
        if let (Some(site_id), Some(mode)) = (config.site_id.take(), config.mode.take()) {
            config.links.push(LiveLinkEntry {
                site_id,
                mode,
                port: 443,
                local_port: 18_080,
            });
        }
    }
    Some(config)
}

fn save_config(app: &tauri::AppHandle, links: Vec<LiveLinkEntry>) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let config = LiveLinkConfig {
        links,
        site_id: None,
        mode: None,
    };
    let contents = serde_json::to_vec_pretty(&config).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.backup");
    if path.is_file() {
        fs::copy(&path, &backup).map_err(|error| error.to_string())?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    file.write_all(&contents)
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

fn local_port_is_available(port: u16) -> bool {
    TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port)).is_ok()
}

fn tailscale_output(args: &[&str], label: &str) -> Result<std::process::Output, String> {
    crate::process::output(
        Command::new("tailscale").args(args),
        crate::process::SHORT_TIMEOUT,
        label,
    )
}

fn missing_serve_handler(output: &std::process::Output) -> bool {
    let detail = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .to_ascii_lowercase();
    detail.contains("no serve config") || detail.contains("handler does not exist")
}

fn status_has_link(value: &serde_json::Value, port: u16, local_port: u16) -> bool {
    let port_suffix = format!(":{port}");
    let target = format!("127.0.0.1:{local_port}");
    match value {
        serde_json::Value::Object(object) => object.iter().any(|(key, child)| {
            (key.ends_with(&port_suffix) && child.to_string().contains(&target))
                || status_has_link(child, port, local_port)
        }),
        serde_json::Value::Array(items) => items
            .iter()
            .any(|item| status_has_link(item, port, local_port)),
        _ => false,
    }
}

fn tailscale_permission_error(detail: &str) -> Option<String> {
    let normalized = detail.to_ascii_lowercase();
    (normalized.contains("access denied")
        && (normalized.contains("serve config denied") || normalized.contains("--operator")))
    .then(|| {
        "Tailscale не дозволяє поточному користувачу керувати Serve. Один раз виконайте в терміналі: sudo tailscale set --operator=$USER, а потім повторіть запуск LiveLink."
            .into()
    })
}

fn tailscale_executable() -> Option<PathBuf> {
    ["/usr/bin/tailscale", "/usr/local/bin/tailscale"]
        .into_iter()
        .map(PathBuf::from)
        .find(|path| path.is_file())
}

fn grant_operator_access() -> Result<(), String> {
    if !Path::new("/usr/bin/pkexec").is_file() {
        return Err(
            "Не знайдено PolicyKit (pkexec). Виконайте вручну: sudo tailscale set --operator=$USER"
                .into(),
        );
    }
    let username_output = crate::process::output(
        Command::new("id").arg("-un"),
        crate::process::SHORT_TIMEOUT,
        "current user detection",
    )?;
    let username = String::from_utf8_lossy(&username_output.stdout)
        .trim()
        .to_owned();
    if !username_output.status.success()
        || username.is_empty()
        || username.len() > 64
        || !username
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Не вдалося безпечно визначити поточного системного користувача".into());
    }
    let executable = tailscale_executable().ok_or("Не знайдено системний Tailscale CLI")?;
    let operator = format!("--operator={username}");
    let output = crate::process::output(
        Command::new("/usr/bin/pkexec")
            .arg(executable)
            .args(["set", &operator])
            .stdin(Stdio::null()),
        crate::process::NETWORK_TIMEOUT,
        "Tailscale operator permission",
    )?;
    if output.status.success() {
        Ok(())
    } else {
        let detail = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        Err(if detail.trim().is_empty() {
            "Надання доступу Tailscale скасовано або відхилено".into()
        } else {
            format!("Не вдалося надати доступ Tailscale: {}", detail.trim())
        })
    }
}

fn start_mode(mode: &str, port: u16, local_port: u16) -> Result<std::process::Output, String> {
    let https = format!("--https={port}");
    let target = format!("http://127.0.0.1:{local_port}");
    tailscale_output(
        &[mode, "--bg", "--yes", &https, &target],
        &format!("Tailscale {mode} start"),
    )
}

fn restore_links(app: &tauri::AppHandle, links: &[LiveLinkEntry]) {
    let _ = save_config(app, links.to_vec());
    let _ = crate::containers::refresh_gateway(app);
    for link in links {
        let _ = start_mode(&link.mode, link.port, link.local_port);
    }
}

pub fn status(app: &tauri::AppHandle) -> LiveLinkStatus {
    let version_output = tailscale_output(&["version"], "Tailscale version");
    let installed = version_output.is_ok();
    let version = version_output.ok().and_then(|output| {
        output.status.success().then(|| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or_default()
                .trim()
                .to_owned()
        })
    });
    let status_output = installed
        .then(|| tailscale_output(&["status", "--json"], "Tailscale status"))
        .and_then(Result::ok);
    let status_json = status_output
        .as_ref()
        .filter(|output| output.status.success())
        .and_then(|output| serde_json::from_slice::<serde_json::Value>(&output.stdout).ok());
    let connected = status_json
        .as_ref()
        .and_then(|value| value.get("BackendState"))
        .and_then(serde_json::Value::as_str)
        .is_some_and(|state| state == "Running");
    let dns_name = status_json
        .as_ref()
        .and_then(|value| value.get("Self"))
        .and_then(|value| value.get("DNSName"))
        .and_then(serde_json::Value::as_str)
        .map(|value| value.trim_end_matches('.').to_owned())
        .filter(|value| !value.is_empty());
    let node_id = status_json
        .as_ref()
        .and_then(|value| value.get("Self"))
        .and_then(|value| value.get("ID"))
        .and_then(serde_json::Value::as_str);
    let serve_enabled = status_json
        .as_ref()
        .and_then(|value| value.get("CertDomains"))
        .and_then(serde_json::Value::as_array)
        .is_some_and(|domains| !domains.is_empty());
    let enable_url = node_id.map(|node| format!("https://login.tailscale.com/f/serve?node={node}"));
    let configured_links = load_config(app)
        .map(|value| value.links)
        .unwrap_or_default();
    let sites = crate::sites::list(app).unwrap_or_default();
    let mut mode_statuses = BTreeMap::new();
    for mode in configured_links.iter().map(|link| link.mode.as_str()) {
        mode_statuses.entry(mode.to_owned()).or_insert_with(|| {
            tailscale_output(&[mode, "status", "--json"], "Tailscale LiveLink status")
                .ok()
                .filter(|output| output.status.success())
                .and_then(|output| serde_json::from_slice(&output.stdout).ok())
                .unwrap_or(serde_json::Value::Null)
        });
    }
    let links = configured_links
        .into_iter()
        .map(|link| {
            let tailscale_active = connected
                && mode_statuses
                    .get(&link.mode)
                    .is_some_and(|value| status_has_link(value, link.port, link.local_port));
            let site = sites.iter().find(|site| site.id == link.site_id);
            let gateway_status = site.and_then(|site| {
                crate::container_routes::local_http_status_on(&site.domain, link.local_port).ok()
            });
            let gateway_active = gateway_status.is_some();
            let project_reachable =
                gateway_status.is_some_and(crate::container_routes::status_is_available);
            let state = if site.is_none() {
                "orphaned"
            } else if !gateway_active {
                "gateway_unavailable"
            } else if !project_reachable {
                "project_unavailable"
            } else if !tailscale_active {
                "tailscale_inactive"
            } else {
                "active"
            };
            LiveLinkStatusEntry {
                site_id: link.site_id,
                mode: link.mode,
                port: link.port,
                local_port: link.local_port,
                tailscale_active,
                gateway_active,
                project_reachable,
                status: state.into(),
            }
        })
        .collect::<Vec<_>>();
    let active = links.iter().any(|link| link.status == "active");
    let first = links.first();
    LiveLinkStatus {
        installed,
        connected,
        serve_enabled,
        version,
        dns_name: dns_name.clone(),
        enable_url,
        active,
        site_id: first.map(|value| value.site_id.clone()),
        mode: first.map(|value| value.mode.clone()),
        url: active
            .then(|| dns_name.map(|name| format!("https://{name}")))
            .flatten(),
        message: if !installed {
            "Tailscale CLI is not installed".into()
        } else if !connected {
            "Tailscale is installed but not connected".into()
        } else if !serve_enabled {
            "Tailscale Serve потребує активації у вашому tailnet".into()
        } else if active {
            "LiveLink is active".into()
        } else {
            "Tailscale is ready".into()
        },
        links,
    }
}

pub(crate) fn active_links(app: &tauri::AppHandle) -> Vec<LiveLinkEntry> {
    load_config(app)
        .map(|config| config.links)
        .unwrap_or_default()
}

fn disable_mode(mode: &str, port: u16) -> Result<(), String> {
    let current = tailscale_output(&[mode, "status"], &format!("Tailscale {mode} status"))?;
    if missing_serve_handler(&current) {
        return Ok(());
    }
    let output = tailscale_output(
        &[mode, &format!("--https={port}"), "off"],
        &format!("Tailscale {mode} stop"),
    )?;
    if output.status.success() || missing_serve_handler(&output) {
        Ok(())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        Err(tailscale_permission_error(&detail).unwrap_or(detail))
    }
}

pub fn start(app: &tauri::AppHandle, site_id: &str, mode: &str) -> Result<LiveLinkStatus, String> {
    if !matches!(mode, "serve" | "funnel") {
        return Err("LiveLink mode must be serve or funnel".into());
    }
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Environment not found")?;
    if environment.runtime_mode == "native" {
        return Err("LiveLink currently supports container environments only".into());
    }
    if crate::containers::environment_status(app, &environment.id)?.status != "running" {
        return Err(
            "Спочатку запустіть середовище вибраного сайту, а потім увімкніть LiveLink".into(),
        );
    }
    let current = status(app);
    if !current.installed || !current.connected {
        return Err(current.message);
    }
    if !current.serve_enabled {
        return Err(format!(
            "Спочатку активуйте Tailscale Serve: {}",
            current.enable_url.unwrap_or_default()
        ));
    }
    let previous_links = load_config(app)
        .map(|config| config.links)
        .unwrap_or_default();
    let mut links = previous_links.clone();
    if let Some(existing) = links.iter().find(|link| link.site_id == site.id).cloned() {
        disable_mode(&existing.mode, existing.port)?;
        links.retain(|link| link.site_id != site.id);
    }
    let port = if mode == "funnel" {
        [443, 8443, 10_000]
            .into_iter()
            .find(|port| links.iter().all(|link| link.port != *port))
            .ok_or("Tailscale Funnel supports at most three simultaneous LiveLink projects")?
    } else {
        std::iter::once(443)
            .chain(8443..=65_535)
            .find(|port| links.iter().all(|link| link.port != *port))
            .ok_or("No available Tailscale Serve port")?
    };
    let local_port = (18_080..=65_535)
        .find(|port| {
            links.iter().all(|link| link.local_port != *port) && local_port_is_available(*port)
        })
        .ok_or("No available local LiveLink port")?;
    links.push(LiveLinkEntry {
        site_id: site.id,
        mode: mode.into(),
        port,
        local_port,
    });
    save_config(app, links)?;
    if let Err(error) = crate::containers::refresh_gateway(app) {
        restore_links(app, &previous_links);
        return Err(error);
    }
    let mut output = start_mode(mode, port, local_port)?;
    let initial_detail = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() && tailscale_permission_error(&initial_detail).is_some() {
        grant_operator_access()?;
        output = start_mode(mode, port, local_port)?;
    }
    if !output.status.success() {
        restore_links(app, &previous_links);
        let detail = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let detail = detail.trim();
        return Err(tailscale_permission_error(detail).unwrap_or_else(|| detail.to_owned()));
    }
    Ok(status(app))
}

pub fn stop(app: &tauri::AppHandle) -> Result<LiveLinkStatus, String> {
    if let Some(config) = load_config(app) {
        for link in config.links {
            disable_mode(&link.mode, link.port)?;
        }
    }
    let path = config_path(app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    crate::containers::refresh_gateway(app)?;
    Ok(status(app))
}

pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(config) = load_config(app) {
        for link in config.links {
            let _ = disable_mode(&link.mode, link.port);
        }
    }
    if let Ok(path) = config_path(app) {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::{missing_serve_handler, status_has_link, tailscale_permission_error};
    use std::process::{ExitStatus, Output};

    #[cfg(unix)]
    fn output(stdout: &str, stderr: &str) -> Output {
        use std::os::unix::process::ExitStatusExt;
        Output {
            status: ExitStatus::from_raw(1 << 8),
            stdout: stdout.as_bytes().to_vec(),
            stderr: stderr.as_bytes().to_vec(),
        }
    }

    #[test]
    #[cfg(unix)]
    fn missing_tailscale_handlers_are_already_stopped() {
        assert!(missing_serve_handler(&output("No serve config", "")));
        assert!(missing_serve_handler(&output(
            "",
            "failed to remove web serve: handler does not exist"
        )));
        assert!(!missing_serve_handler(&output("", "permission denied")));
    }

    #[test]
    fn explains_how_to_grant_tailscale_operator_access() {
        let message = tailscale_permission_error(
            "Access denied: serve config denied. Use sudo tailscale set --operator=$USER",
        )
        .unwrap();
        assert!(message.contains("sudo tailscale set --operator=$USER"));
        assert!(tailscale_permission_error("network unavailable").is_none());
    }

    #[test]
    fn matches_the_exact_tailscale_port_and_gateway_target() {
        let status = serde_json::json!({
            "Web": {
                "device.example.ts.net:8443": {
                    "Handlers": {
                        "/": { "Proxy": "http://127.0.0.1:18081" }
                    }
                }
            }
        });
        assert!(status_has_link(&status, 8443, 18081));
        assert!(!status_has_link(&status, 443, 18081));
        assert!(!status_has_link(&status, 8443, 18082));
    }
}
