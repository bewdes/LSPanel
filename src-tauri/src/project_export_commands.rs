use std::path::Path;

#[tauri::command]
pub async fn export_project(
    app: tauri::AppHandle,
    site_id: String,
    destination: String,
) -> Result<String, crate::app_error::AppError> {
    let site = crate::sites::list(&app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    crate::database_commands::run_operation(
        app,
        site.environment_id,
        "project-export",
        move |app, _| {
            crate::project_export::export(app, &site_id, Path::new(&destination))
                .map(|path| path.to_string_lossy().into_owned())
        },
    )
    .await
}

#[tauri::command]
pub async fn import_project_bundle(
    app: tauri::AppHandle,
    source: String,
    name: String,
    domain: String,
) -> Result<Vec<crate::sites::Site>, crate::app_error::AppError> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let environment_id = format!("env-{timestamp}");
    let operation = crate::operations::create(&app, Some(&environment_id), "project-import")?;
    let operation_id = operation.id.clone();
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::project_export::import(&worker, Path::new(&source), &name, &domain, &environment_id)
    })
    .await
    .map_err(|error| error.to_string())?;
    match &result {
        Ok(_) => crate::operations::complete(&app, &operation_id)?,
        Err(error) => crate::operations::fail(&app, &operation_id, error)?,
    }
    crate::app_error::AppError::operation_result(result, operation_id)
}
