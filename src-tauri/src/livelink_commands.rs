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
) -> Result<LiveLinkStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || crate::livelink::start(&app, &site_id, &mode))
        .await
        .map_err(|error| AppError::from(format!("Не вдалося запустити LiveLink: {error}")))?
        .map_err(AppError::from)
}

#[tauri::command]
pub async fn stop_livelink(app: tauri::AppHandle) -> Result<LiveLinkStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || crate::livelink::stop(&app))
        .await
        .map_err(|error| AppError::from(format!("Не вдалося зупинити LiveLink: {error}")))?
        .map_err(AppError::from)
}
