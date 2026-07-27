use std::path::Path;

#[tauri::command]
pub fn read_site_environment(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<crate::environment_files::EnvironmentFile, String> {
    crate::environment_files::read(&app, &site_id)
}

#[tauri::command]
pub fn read_site_environment_example(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<crate::environment_files::EnvironmentFile, String> {
    crate::environment_files::read_example(&app, &site_id)
}

#[tauri::command]
pub fn write_site_environment(
    app: tauri::AppHandle,
    site_id: String,
    text: String,
) -> Result<crate::environment_files::EnvironmentFile, String> {
    crate::environment_files::write(&app, &site_id, &text)
}

#[tauri::command]
pub fn generate_environment_secret(length: usize) -> Result<String, String> {
    crate::environment_files::generate_secret(length)
}

#[tauri::command]
pub fn import_site_environment(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
) -> Result<crate::environment_files::EnvironmentFile, String> {
    crate::environment_files::import_file(&app, &site_id, Path::new(&path))
}

#[tauri::command]
pub fn export_site_environment(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
) -> Result<(), String> {
    crate::environment_files::export_file(&app, &site_id, Path::new(&path))
}

#[tauri::command]
pub fn list_site_environment_profiles(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<Vec<String>, String> {
    crate::environment_files::list_profiles(&app, &site_id)
}

#[tauri::command]
pub fn save_site_environment_profile(
    app: tauri::AppHandle,
    site_id: String,
    profile: String,
    text: String,
) -> Result<(), String> {
    crate::environment_files::save_profile(&app, &site_id, &profile, &text)
}

#[tauri::command]
pub fn activate_site_environment_profile(
    app: tauri::AppHandle,
    site_id: String,
    profile: String,
) -> Result<crate::environment_files::EnvironmentFile, String> {
    crate::environment_files::activate_profile(&app, &site_id, &profile)
}

#[tauri::command]
pub fn delete_site_environment_profile(
    app: tauri::AppHandle,
    site_id: String,
    profile: String,
) -> Result<(), String> {
    crate::environment_files::delete_profile(&app, &site_id, &profile)
}
