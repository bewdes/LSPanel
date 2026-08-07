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
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let site = crate::sites::list(&worker)?
            .into_iter()
            .find(|site| site.id == site_id)
            .ok_or("Site not found")?;
        crate::git::initialize(&format!("{}/app", site.directory), &site.project_type)
    })
    .await
    .map_err(|error| error.to_string())??;
    crate::notifications::send_localized(
        &app,
        "git",
        "Git-репозиторій ініціалізовано",
        "Git repository initialized",
    );
    Ok(result)
}

#[tauri::command]
pub async fn open_site_git_remote(app: tauri::AppHandle, site_id: String) -> Result<(), String> {
    let url = tauri::async_runtime::spawn_blocking(move || {
        let site = crate::sites::list(&app)?
            .into_iter()
            .find(|site| site.id == site_id)
            .ok_or("Site not found")?;
        crate::git::repository_url(&format!("{}/app", site.directory))
    })
    .await
    .map_err(|error| error.to_string())??;
    crate::desktop_commands::spawn_program("xdg-open", &[&url])
}

#[tauri::command]
pub async fn site_git_action(
    app: tauri::AppHandle,
    directory: String,
    action: String,
    message: String,
) -> Result<crate::git::GitStatus, String> {
    let notify_action = action.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::git::action(&directory, &action, &message)
    })
    .await
    .map_err(|error| error.to_string())??;
    let (body_uk, body_en) = match notify_action.as_str() {
        "fetch" => ("Git fetch виконано", "Git fetch completed"),
        "pull" => ("Git pull виконано", "Git pull completed"),
        "push" => ("Git push виконано", "Git push completed"),
        "commit" => ("Коміт створено", "Commit created"),
        _ => ("Git-дію виконано", "Git action completed"),
    };
    crate::notifications::send_localized(&app, "git", body_uk, body_en);
    Ok(result)
}

#[tauri::command]
pub async fn site_git_details(directory: String) -> Result<crate::git::GitDetails, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::details(&directory))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn site_git_checkout(
    app: tauri::AppHandle,
    directory: String,
    branch: String,
    create: bool,
    stash: bool,
    force: bool,
) -> Result<crate::git::GitStatus, String> {
    let notify_branch = branch.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::git::checkout(&directory, &branch, create, stash, force)
    })
    .await
    .map_err(|error| error.to_string())??;
    crate::notifications::send_localized(
        &app,
        "git",
        &format!("Перемкнено на гілку «{notify_branch}»"),
        &format!("Switched to branch \"{notify_branch}\""),
    );
    Ok(result)
}
