use std::path::Path;

#[tauri::command]
pub fn list_project_snapshots(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<Vec<crate::snapshots::Snapshot>, String> {
    crate::snapshots::list(&app, &site_id)
}

#[tauri::command]
pub async fn compare_project_snapshot(
    app: tauri::AppHandle,
    site_id: String,
    snapshot_id: String,
) -> Result<crate::snapshots::SnapshotComparison, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::snapshots::compare(&app, &site_id, &snapshot_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn create_project_snapshot(
    app: tauri::AppHandle,
    site_id: String,
    name: String,
) -> Result<crate::snapshots::Snapshot, crate::app_error::AppError> {
    let site = crate::sites::list(&app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    crate::database_commands::run_operation(
        app,
        site.environment_id,
        "project-snapshot",
        move |app, _| crate::snapshots::create(app, &site_id, &name),
    )
    .await
}

#[tauri::command]
pub async fn restore_project_snapshot(
    app: tauri::AppHandle,
    site_id: String,
    snapshot_id: String,
) -> Result<(), crate::app_error::AppError> {
    let site = crate::sites::list(&app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    crate::database_commands::run_operation(
        app,
        site.environment_id,
        "snapshot-restore",
        move |app, _| crate::snapshots::restore(app, &site_id, &snapshot_id),
    )
    .await
}

#[tauri::command]
pub async fn delete_project_snapshot(
    app: tauri::AppHandle,
    site_id: String,
    snapshot_id: String,
) -> Result<(), crate::app_error::AppError> {
    let site = crate::sites::list(&app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    crate::database_commands::run_operation(
        app,
        site.environment_id,
        "snapshot-delete",
        move |app, _| crate::snapshots::delete(app, &site_id, &snapshot_id),
    )
    .await
}

#[tauri::command]
pub async fn export_project_snapshot(
    app: tauri::AppHandle,
    site_id: String,
    snapshot_id: String,
    destination: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::snapshots::export(&app, &site_id, &snapshot_id, Path::new(&destination))
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn import_project_snapshot(
    app: tauri::AppHandle,
    site_id: String,
    source: String,
) -> Result<crate::snapshots::Snapshot, crate::app_error::AppError> {
    let site = crate::sites::list(&app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    crate::database_commands::run_operation(
        app,
        site.environment_id,
        "snapshot-import",
        move |app, _| crate::snapshots::import(app, &site_id, Path::new(&source)),
    )
    .await
}

#[tauri::command]
pub async fn prune_project_snapshots(
    app: tauri::AppHandle,
    site_id: String,
    keep: usize,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || crate::snapshots::prune(&app, &site_id, keep))
        .await
        .map_err(|error| error.to_string())?
}
