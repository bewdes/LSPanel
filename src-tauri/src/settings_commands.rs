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
    crate::settings::save(&app, settings)
}
