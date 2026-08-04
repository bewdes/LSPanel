use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};

struct TunnelHandle {
    child: Child,
    url: Arc<Mutex<Option<String>>>,
}

#[derive(Default)]
pub struct TunnelProcesses(Mutex<HashMap<String, TunnelHandle>>);

impl Drop for TunnelProcesses {
    fn drop(&mut self) {
        if let Ok(mut processes) = self.0.lock() {
            for handle in processes.values_mut() {
                crate::process::terminate(&mut handle.child);
            }
            processes.clear();
        }
    }
}

pub fn binary_name(provider: &str) -> Option<&'static str> {
    match provider {
        "ngrok" => Some("ngrok"),
        "cloudflare" => Some("cloudflared"),
        _ => None,
    }
}

pub fn installed(provider: &str) -> bool {
    let Some(binary) = binary_name(provider) else {
        return false;
    };
    crate::process::output(
        Command::new(binary).arg("--version"),
        crate::process::SHORT_TIMEOUT,
        &format!("{binary} version"),
    )
    .is_ok_and(|output| output.status.success())
}

fn cloudflared_directory() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cloudflared"))
}

pub fn cloudflare_authenticated() -> bool {
    cloudflared_directory().is_some_and(|directory| directory.join("cert.pem").is_file())
}

pub fn cloudflare_login() -> Result<(), String> {
    if !installed("cloudflare") {
        return Err("cloudflared is not installed or is not available on PATH".into());
    }
    let output = Command::new("cloudflared")
        .args(["tunnel", "login"])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to launch Cloudflare authentication: {error}"))?;
    if output.status.success() && cloudflare_authenticated() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    Err(if detail.is_empty() {
        "Cloudflare authentication was cancelled or did not create cert.pem".into()
    } else {
        format!("Cloudflare authentication failed: {detail}")
    })
}

/// Saves the ngrok authtoken via `ngrok config add-authtoken`, so ngrok
/// itself persists it in the user's own ngrok config file — LS Panel never
/// stores this secret. The token is never echoed back in error messages.
pub fn set_ngrok_authtoken(token: &str) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("Enter an ngrok authtoken".into());
    }
    let output = Command::new("ngrok")
        .args(["config", "add-authtoken", token])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to launch ngrok: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err("ngrok rejected the authtoken. Check that it was copied correctly.".into())
    }
}

pub fn is_active(state: &TunnelProcesses, site_id: &str) -> bool {
    let mut processes = state.0.lock().unwrap();
    let Some(handle) = processes.get_mut(site_id) else {
        return false;
    };
    match handle.child.try_wait() {
        Ok(None) => true,
        _ => {
            processes.remove(site_id);
            false
        }
    }
}

pub fn public_url(
    state: &TunnelProcesses,
    provider: &str,
    site_id: &str,
    local_port: u16,
) -> Option<String> {
    if provider == "ngrok" {
        return ngrok_public_url(local_port);
    }
    let processes = state.0.lock().unwrap();
    processes
        .get(site_id)
        .and_then(|handle| handle.url.lock().unwrap().clone())
}

pub fn stop(state: &TunnelProcesses, site_id: &str) {
    let mut processes = state.0.lock().unwrap();
    if let Some(mut handle) = processes.remove(site_id) {
        crate::process::terminate(&mut handle.child);
        let _ = handle.child.wait();
    }
}

pub fn stop_all(state: &TunnelProcesses) {
    let mut processes = state.0.lock().unwrap();
    for (_, mut handle) in processes.drain() {
        crate::process::terminate(&mut handle.child);
        let _ = handle.child.wait();
    }
}

pub fn start(
    state: &TunnelProcesses,
    provider: &str,
    site_id: &str,
    local_port: u16,
    cloudflare: Option<(&str, &Path)>,
) -> Result<(), String> {
    stop(state, site_id);
    match provider {
        "ngrok" => start_ngrok(state, site_id, local_port),
        "cloudflare" => {
            let (hostname, config_directory) =
                cloudflare.ok_or("A hostname is required for Cloudflare Tunnel")?;
            start_cloudflare(state, site_id, local_port, hostname, config_directory)
        }
        _ => Err("Unsupported LiveLink provider".into()),
    }
}

fn start_ngrok(state: &TunnelProcesses, site_id: &str, local_port: u16) -> Result<(), String> {
    let child = Command::new("ngrok")
        .args(["http", &local_port.to_string(), "--log", "stdout"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to launch ngrok: {error}"))?;
    let handle = TunnelHandle {
        child,
        url: Arc::new(Mutex::new(None)),
    };
    state.0.lock().unwrap().insert(site_id.to_owned(), handle);
    for _ in 0..20 {
        std::thread::sleep(Duration::from_millis(500));
        if let Some(url) = ngrok_public_url(local_port) {
            let processes = state.0.lock().unwrap();
            if let Some(handle) = processes.get(site_id) {
                *handle.url.lock().unwrap() = Some(url);
            }
            return Ok(());
        }
        if !is_active(state, site_id) {
            break;
        }
    }
    stop(state, site_id);
    Err(
        "ngrok did not report a public URL. Make sure it is installed and authenticated \
         (ngrok config add-authtoken ...)."
            .into(),
    )
}

fn ngrok_public_url(local_port: u16) -> Option<String> {
    let body = http_get_local(4040, "/api/tunnels")?;
    let value: Value = serde_json::from_str(&body).ok()?;
    let target = format!("127.0.0.1:{local_port}");
    value.get("tunnels")?.as_array()?.iter().find_map(|tunnel| {
        let config_addr = tunnel.get("config")?.get("addr")?.as_str()?;
        if !config_addr.contains(&target) {
            return None;
        }
        tunnel.get("public_url")?.as_str().map(str::to_owned)
    })
}

fn start_cloudflare(
    state: &TunnelProcesses,
    site_id: &str,
    local_port: u16,
    hostname: &str,
    config_directory: &Path,
) -> Result<(), String> {
    if !cloudflare_authenticated() {
        return Err("Authenticate Cloudflare Tunnel before publishing a site".into());
    }
    let tunnel_name = format!(
        "lspanel-{}",
        site_id
            .chars()
            .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
            .take(48)
            .collect::<String>()
    );
    let tunnel_id = cloudflare_tunnel_id(&tunnel_name)?.unwrap_or_else(String::new);
    let tunnel_id = if tunnel_id.is_empty() {
        cloudflare_create_tunnel(&tunnel_name)?;
        cloudflare_tunnel_id(&tunnel_name)?
            .ok_or("Cloudflare created the tunnel but it was not returned by tunnel list")?
    } else {
        tunnel_id
    };
    let credentials = cloudflared_directory()
        .ok_or("The user home directory is unavailable")?
        .join(format!("{tunnel_id}.json"));
    if !credentials.is_file() {
        return Err(format!(
            "Cloudflare credentials were not found at {}",
            credentials.display()
        ));
    }
    std::fs::create_dir_all(config_directory)
        .map_err(|error| format!("Failed to create Cloudflare config directory: {error}"))?;
    let config_path = config_directory.join(format!("{tunnel_name}.yml"));
    let credentials_value = serde_json::to_string(&credentials.to_string_lossy())
        .map_err(|error| format!("Failed to encode the Cloudflare credentials path: {error}"))?;
    let config = format!(
        "url: http://127.0.0.1:{local_port}\ntunnel: {tunnel_id}\ncredentials-file: {}\n",
        credentials_value
    );
    std::fs::write(&config_path, config)
        .map_err(|error| format!("Failed to write Cloudflare tunnel config: {error}"))?;
    let route = Command::new("cloudflared")
        .args([
            "tunnel",
            "route",
            "dns",
            "--overwrite-dns",
            &tunnel_id,
            hostname,
        ])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to create the Cloudflare DNS route: {error}"))?;
    if !route.status.success() {
        return Err(format!(
            "Cloudflare could not route {hostname}: {}",
            String::from_utf8_lossy(&route.stderr).trim()
        ));
    }
    let mut child = Command::new("cloudflared")
        .args(["tunnel", "--config"])
        .arg(&config_path)
        .args(["run", &tunnel_id])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to launch cloudflared: {error}"))?;
    let url = Arc::new(Mutex::new(Some(format!("https://{hostname}"))));
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for _ in reader.lines().map_while(Result::ok) {}
        });
    }
    let handle = TunnelHandle {
        child,
        url: Arc::clone(&url),
    };
    state.0.lock().unwrap().insert(site_id.to_owned(), handle);
    for _ in 0..10 {
        std::thread::sleep(Duration::from_millis(500));
        if is_active(state, site_id) {
            return Ok(());
        }
    }
    stop(state, site_id);
    Err("The Cloudflare tunnel process stopped before it became ready".into())
}

fn cloudflare_tunnel_id(name: &str) -> Result<Option<String>, String> {
    let output = Command::new("cloudflared")
        .args(["tunnel", "list", "--output", "json"])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to list Cloudflare tunnels: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Failed to list Cloudflare tunnels: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let tunnels = serde_json::from_slice::<Vec<Value>>(&output.stdout)
        .map_err(|error| format!("Cloudflare returned an invalid tunnel list: {error}"))?;
    Ok(tunnels.into_iter().find_map(|tunnel| {
        (tunnel.get("name")?.as_str()? == name)
            .then(|| tunnel.get("id")?.as_str().map(str::to_owned))
            .flatten()
    }))
}

fn cloudflare_create_tunnel(name: &str) -> Result<(), String> {
    let output = Command::new("cloudflared")
        .args(["tunnel", "create", name])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Failed to create the Cloudflare tunnel: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to create the Cloudflare tunnel: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn http_get_local(port: u16, path: &str) -> Option<String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    )
    .ok()?;
    let mut buffer = String::new();
    stream.read_to_string(&mut buffer).ok()?;
    buffer
        .split_once("\r\n\r\n")
        .map(|(_, body)| body.to_owned())
}
