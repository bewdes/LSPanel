#[tauri::command]
pub async fn install_local_ca(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::tls::install_ca(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn reissue_local_https(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::tls::force_reissue(&app)?;
        crate::containers::refresh_gateway(&app)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn local_certificate_status(
    app: tauri::AppHandle,
) -> Result<crate::tls::CertificateStatus, String> {
    crate::tls::status(&app)
}

#[tauri::command]
pub async fn delete_local_https(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::containers::remove_gateway(&app)?;
        crate::tls::remove_server_certificate(&app)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn reset_local_ca(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::containers::remove_gateway(&app)?;
        crate::tls::reset_ca(&app)
    })
    .await
    .map_err(|error| error.to_string())?
}
