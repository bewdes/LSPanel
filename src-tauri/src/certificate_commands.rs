#[tauri::command]
pub async fn install_local_ca(app: tauri::AppHandle) -> Result<(), String> {
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::tls::install_ca(&worker))
        .await
        .map_err(|error| error.to_string())??;
    crate::notifications::send_localized(
        &app,
        "certificate",
        "Кореневий сертифікат (CA) встановлено та довірено системою",
        "Root certificate (CA) installed and trusted by the system",
    );
    Ok(())
}

#[tauri::command]
pub async fn reissue_local_https(app: tauri::AppHandle) -> Result<(), String> {
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::tls::force_reissue(&worker)?;
        crate::containers::refresh_gateway(&worker)
    })
    .await
    .map_err(|error| error.to_string())??;
    crate::notifications::send_localized(
        &app,
        "certificate",
        "Сертифікат для локальних сайтів перевипущено",
        "Local sites certificate reissued",
    );
    Ok(())
}

#[tauri::command]
pub fn local_certificate_status(
    app: tauri::AppHandle,
) -> Result<crate::tls::CertificateStatus, String> {
    crate::tls::status(&app)
}

#[tauri::command]
pub async fn delete_local_https(app: tauri::AppHandle) -> Result<(), String> {
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::containers::remove_gateway(&worker)?;
        crate::tls::remove_server_certificate(&worker)
    })
    .await
    .map_err(|error| error.to_string())??;
    crate::notifications::send_localized(
        &app,
        "certificate",
        "HTTPS для локальних сайтів вимкнено",
        "HTTPS for local sites disabled",
    );
    Ok(())
}

#[tauri::command]
pub async fn reset_local_ca(app: tauri::AppHandle) -> Result<(), String> {
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::containers::remove_gateway(&worker)?;
        crate::tls::reset_ca(&worker)
    })
    .await
    .map_err(|error| error.to_string())??;
    crate::notifications::send_localized(
        &app,
        "certificate",
        "Кореневий сертифікат (CA) скинуто",
        "Root certificate (CA) reset",
    );
    Ok(())
}
