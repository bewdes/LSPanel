#[tauri::command]
pub async fn site_git_status(directory: String) -> Result<crate::git::GitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::status(&directory))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn initialize_site_git(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<crate::git::GitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let site = crate::sites::list(&app)?
            .into_iter()
            .find(|site| site.id == site_id)
            .ok_or("Site not found")?;
        crate::git::initialize(&site.directory, &site.project_type)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn open_site_git_remote(app: tauri::AppHandle, site_id: String) -> Result<(), String> {
    let url = tauri::async_runtime::spawn_blocking(move || {
        let site = crate::sites::list(&app)?
            .into_iter()
            .find(|site| site.id == site_id)
            .ok_or("Site not found")?;
        crate::git::repository_url(&site.directory)
    })
    .await
    .map_err(|error| error.to_string())??;
    crate::desktop_commands::spawn_program("xdg-open", &[&url])
}

#[tauri::command]
pub async fn site_git_action(
    directory: String,
    action: String,
    message: String,
) -> Result<crate::git::GitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::action(&directory, &action, &message))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn site_git_details(directory: String) -> Result<crate::git::GitDetails, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::details(&directory))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn site_git_checkout(
    directory: String,
    branch: String,
    create: bool,
) -> Result<crate::git::GitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::checkout(&directory, &branch, create))
        .await
        .map_err(|error| error.to_string())?
}
