use serde_json::Value;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
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
) -> Result<(), String> {
    stop(state, site_id);
    match provider {
        "ngrok" => start_ngrok(state, site_id, local_port),
        "cloudflare" => start_cloudflare(state, site_id, local_port),
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

fn start_cloudflare(state: &TunnelProcesses, site_id: &str, local_port: u16) -> Result<(), String> {
    let mut child = Command::new("cloudflared")
        .args(["tunnel", "--url", &format!("http://127.0.0.1:{local_port}")])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to launch cloudflared: {error}"))?;
    let url = Arc::new(Mutex::new(None));
    if let Some(stderr) = child.stderr.take() {
        let url = Arc::clone(&url);
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let Some(start) = line.find("https://") else {
                    continue;
                };
                let Some(found) = line[start..].split_whitespace().next() else {
                    continue;
                };
                if found.contains(".trycloudflare.com") {
                    *url.lock().unwrap() = Some(found.trim_end_matches(['.', ',']).to_owned());
                }
            }
        });
    }
    let handle = TunnelHandle {
        child,
        url: Arc::clone(&url),
    };
    state.0.lock().unwrap().insert(site_id.to_owned(), handle);
    for _ in 0..30 {
        std::thread::sleep(Duration::from_millis(500));
        if url.lock().unwrap().is_some() {
            return Ok(());
        }
        if !is_active(state, site_id) {
            break;
        }
    }
    stop(state, site_id);
    Err("cloudflared did not report a public URL. Make sure it is installed correctly.".into())
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
