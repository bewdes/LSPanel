#[tauri::command]
pub fn load_settings(
    app: tauri::AppHandle,
) -> Result<Option<crate::settings::AppSettings>, String> {
    crate::settings::load(&app)
}

#[tauri::command]
pub fn save_settings(
    app: tauri::AppHandle,
    settings: crate::settings::AppSettings,
) -> Result<crate::settings::AppSettings, String> {
    let saved = crate::settings::save(&app, settings)?;
    crate::notifications::send_localized(
        &app,
        "settings",
        "Налаштування збережено",
        "Settings saved",
    );
    Ok(saved)
}
