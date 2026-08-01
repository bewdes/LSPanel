#[tauri::command]
pub fn list_project_files(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
) -> Result<Vec<crate::file_manager::ProjectFileEntry>, String> {
    crate::file_manager::list(&app, &site_id, &path)
}

#[tauri::command]
pub fn read_project_file(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
) -> Result<crate::file_manager::ProjectTextFile, String> {
    crate::file_manager::read(&app, &site_id, &path)
}

#[tauri::command]
pub fn write_project_file(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
    text: String,
) -> Result<crate::file_manager::ProjectTextFile, String> {
    let result = crate::file_manager::write(&app, &site_id, &path, &text)?;
    crate::notifications::send_localized(
        &app,
        "file",
        &format!("Файл «{path}» збережено"),
        &format!("File \"{path}\" saved"),
    );
    Ok(result)
}

#[tauri::command]
pub fn create_project_directory(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
) -> Result<(), String> {
    crate::file_manager::create_directory(&app, &site_id, &path)?;
    crate::notifications::send_localized(
        &app,
        "file",
        &format!("Папку «{path}» створено"),
        &format!("Folder \"{path}\" created"),
    );
    Ok(())
}

#[tauri::command]
pub fn rename_project_file(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
    new_name: String,
) -> Result<String, String> {
    let result = crate::file_manager::rename(&app, &site_id, &path, &new_name)?;
    crate::notifications::send_localized(
        &app,
        "file",
        &format!("«{path}» перейменовано на «{new_name}»"),
        &format!("\"{path}\" renamed to \"{new_name}\""),
    );
    Ok(result)
}

#[tauri::command]
pub fn delete_project_file(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
) -> Result<(), String> {
    crate::file_manager::delete(&app, &site_id, &path)?;
    crate::notifications::send_localized(
        &app,
        "file",
        &format!("«{path}» видалено"),
        &format!("\"{path}\" deleted"),
    );
    Ok(())
}

#[tauri::command]
pub fn search_project_files(
    app: tauri::AppHandle,
    site_id: String,
    query: String,
) -> Result<Vec<crate::file_manager::ProjectFileEntry>, String> {
    crate::file_manager::search(&app, &site_id, &query)
}

#[tauri::command]
pub fn project_file_absolute_path(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
) -> Result<String, String> {
    crate::file_manager::absolute_path(&app, &site_id, &path)
}

#[tauri::command]
pub async fn project_file_usage(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
) -> Result<crate::file_manager::ProjectPathUsage, String> {
    tauri::async_runtime::spawn_blocking(move || crate::file_manager::usage(&app, &site_id, &path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn file_manager_overview(
    app: tauri::AppHandle,
) -> Result<crate::file_manager::FileManagerOverview, String> {
    tauri::async_runtime::spawn_blocking(move || crate::file_manager::overview(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn file_manager_folder_details(
    app: tauri::AppHandle,
    scope: String,
    resource_id: String,
) -> Result<crate::file_manager::FolderDetails, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::file_manager::folder_details(&app, &scope, &resource_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn set_project_file_permissions(
    app: tauri::AppHandle,
    site_id: String,
    path: String,
    mode: String,
) -> Result<(), String> {
    crate::file_manager::set_permissions(&app, &site_id, &path, &mode)?;
    crate::notifications::send_localized(
        &app,
        "file",
        &format!("Права доступу «{path}» змінено на {mode}"),
        &format!("Permissions for \"{path}\" changed to {mode}"),
    );
    Ok(())
}

#[tauri::command]
pub fn list_managed_files(
    app: tauri::AppHandle,
    scope: String,
    resource_id: String,
    path: String,
) -> Result<Vec<crate::file_manager::ProjectFileEntry>, String> {
    crate::file_manager::list_managed(&app, &scope, &resource_id, &path)
}

#[tauri::command]
pub fn read_managed_file(
    app: tauri::AppHandle,
    scope: String,
    resource_id: String,
    path: String,
) -> Result<crate::file_manager::ProjectTextFile, String> {
    crate::file_manager::read_managed(&app, &scope, &resource_id, &path)
}
