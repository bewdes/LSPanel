use std::{
    path::Path,
    process::{Command, Stdio},
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub(crate) fn spawn_program(program: &str, args: &[&str]) -> Result<(), String> {
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to launch {program}: {error}"))
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    spawn_program("xdg-open", &[&path])
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let without_scheme = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
        .ok_or("Only HTTP(S) local site URLs are allowed")?;
    let authority = without_scheme.split('/').next().unwrap_or_default();
    let host = authority.split(':').next().unwrap_or_default();
    if !(host == "localhost"
        || host == "127.0.0.1"
        || host.ends_with(".localhost")
        || host.ends_with(".ts.net")
        || host == "login.tailscale.com")
    {
        return Err(
            "Only localhost, *.localhost, *.ts.net and Tailscale activation URLs are allowed"
                .into(),
        );
    }
    spawn_program("xdg-open", &[&url])
}

#[tauri::command]
pub fn open_terminal(path: String) -> Result<(), String> {
    if !Path::new(&path).is_dir() {
        return Err(format!("Directory does not exist: {path}"));
    }
    for (program, args) in [
        ("xdg-terminal-exec", vec!["--working-directory", &path]),
        ("gnome-terminal", vec!["--working-directory", &path]),
        ("konsole", vec!["--workdir", &path]),
        ("xfce4-terminal", vec!["--working-directory", &path]),
    ] {
        if Command::new(program)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
    }
    Err("No supported terminal emulator was found".into())
}

#[tauri::command]
pub fn open_editor(path: String) -> Result<(), String> {
    if !Path::new(&path).is_dir() {
        return Err(format!("Directory does not exist: {path}"));
    }
    spawn_program("code", &[&path])
}

#[tauri::command]
pub fn open_containers_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("containers") {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        "containers",
        WebviewUrl::App("index.html?view=containers".into()),
    )
    .title("LS Panel — Containers")
    .decorations(false)
    .transparent(false)
    .inner_size(1120.0, 760.0)
    .min_inner_size(900.0, 620.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::open_url;

    #[test]
    fn rejects_non_local_urls_before_launching_a_browser() {
        assert!(open_url("https://example.com".into()).is_err());
        assert!(open_url("file:///etc/passwd".into()).is_err());
    }

    #[test]
    fn rejects_spoofed_tailscale_urls() {
        assert!(open_url("javascript:alert(1)".into()).is_err());
        assert!(open_url("https://example.ts.net.evil.test".into()).is_err());
    }
}
