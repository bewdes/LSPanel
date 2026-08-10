use crate::{app_error::AppError, livelink::LiveLinkStatus};

#[tauri::command]
pub async fn livelink_status(app: tauri::AppHandle) -> Result<LiveLinkStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || crate::livelink::status(&app))
        .await
        .map_err(|error| AppError::from(format!("Не вдалося перевірити стан LiveLink: {error}")))
}

#[tauri::command]
pub async fn start_livelink(
    app: tauri::AppHandle,
    site_id: String,
    mode: String,
    provider: String,
    hostname: Option<String>,
) -> Result<LiveLinkStatus, AppError> {
    let worker = app.clone();
    let provider_for_watch = provider.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::livelink::start(&worker, &site_id, &mode, &provider, hostname.as_deref())
    })
    .await
    .map_err(|error| AppError::from(format!("Не вдалося запустити LiveLink: {error}")))?
    .map_err(AppError::from)?;
    crate::notifications::send_localized(
        &app,
        "livelink",
        "LiveLink увімкнено",
        "LiveLink enabled",
    );
    if provider_for_watch == "tailscale" && !result.serve_enabled {
        let watcher = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            crate::livelink::watch_until_serve_enabled(&watcher)
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn cloudflare_tunnel_login(app: tauri::AppHandle) -> Result<(), AppError> {
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::tunnel_provider::cloudflare_login(&worker))
        .await
        .map_err(|error| AppError::from(format!("Failed to authenticate Cloudflare: {error}")))?
        .map_err(AppError::from)?;
    crate::notifications::send_localized(
        &app,
        "livelink",
        "Cloudflare Tunnel авторизовано",
        "Cloudflare Tunnel authenticated",
    );
    Ok(())
}

#[tauri::command]
pub async fn cloudflare_tunnel_reset(app: tauri::AppHandle) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(crate::tunnel_provider::cloudflare_reset_auth)
        .await
        .map_err(|error| AppError::from(format!("Failed to reset Cloudflare auth: {error}")))?
        .map_err(AppError::from)?;
    crate::notifications::send_localized(
        &app,
        "livelink",
        "Авторизацію Cloudflare Tunnel скинуто",
        "Cloudflare Tunnel authorization reset",
    );
    Ok(())
}

#[tauri::command]
pub async fn stop_livelink_site(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<LiveLinkStatus, AppError> {
    let worker = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || crate::livelink::stop_site(&worker, &site_id))
            .await
            .map_err(|error| AppError::from(format!("Не вдалося зупинити LiveLink: {error}")))?
            .map_err(AppError::from)?;
    crate::notifications::send_localized(
        &app,
        "livelink",
        "LiveLink вимкнено",
        "LiveLink disabled",
    );
    Ok(result)
}

#[tauri::command]
pub async fn stop_livelink(app: tauri::AppHandle) -> Result<LiveLinkStatus, AppError> {
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || crate::livelink::stop(&worker))
        .await
        .map_err(|error| AppError::from(format!("Не вдалося зупинити LiveLink: {error}")))?
        .map_err(AppError::from)?;
    crate::notifications::send_localized(
        &app,
        "livelink",
        "LiveLink вимкнено",
        "LiveLink disabled",
    );
    Ok(result)
}

#[tauri::command]
pub async fn set_ngrok_authtoken(app: tauri::AppHandle, token: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::tunnel_provider::set_ngrok_authtoken(&token)
    })
    .await
    .map_err(|error| AppError::from(format!("Failed to save the ngrok authtoken: {error}")))?
    .map_err(AppError::from)?;
    crate::notifications::send_localized(
        &app,
        "livelink",
        "Ngrok authtoken збережено",
        "Ngrok authtoken saved",
    );
    Ok(())
}
