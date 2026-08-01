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
    let result = crate::environment_files::write(&app, &site_id, &text)?;
    crate::notifications::send_localized(
        &app,
        "environment-file",
        "Файл .env збережено",
        ".env file saved",
    );
    Ok(result)
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
    let result = crate::environment_files::import_file(&app, &site_id, Path::new(&path))?;
    crate::notifications::send_localized(
        &app,
        "environment-file",
        "Файл .env імпортовано",
        ".env file imported",
    );
    Ok(result)
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
    crate::environment_files::save_profile(&app, &site_id, &profile, &text)?;
    crate::notifications::send_localized(
        &app,
        "environment-file",
        &format!("Профіль «{profile}» збережено"),
        &format!("Profile \"{profile}\" saved"),
    );
    Ok(())
}

#[tauri::command]
pub fn activate_site_environment_profile(
    app: tauri::AppHandle,
    site_id: String,
    profile: String,
) -> Result<crate::environment_files::EnvironmentFile, String> {
    let result = crate::environment_files::activate_profile(&app, &site_id, &profile)?;
    crate::notifications::send_localized(
        &app,
        "environment-file",
        &format!("Профіль «{profile}» активовано"),
        &format!("Profile \"{profile}\" activated"),
    );
    Ok(result)
}

#[tauri::command]
pub fn delete_site_environment_profile(
    app: tauri::AppHandle,
    site_id: String,
    profile: String,
) -> Result<(), String> {
    crate::environment_files::delete_profile(&app, &site_id, &profile)?;
    crate::notifications::send_localized(
        &app,
        "environment-file",
        &format!("Профіль «{profile}» видалено"),
        &format!("Profile \"{profile}\" deleted"),
    );
    Ok(())
}
