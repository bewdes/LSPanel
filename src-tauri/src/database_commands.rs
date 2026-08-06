use std::path::Path;

#[tauri::command]
pub fn list_database_backups(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<Vec<crate::backups::DatabaseBackup>, String> {
    crate::backups::list(&app, &environment_id)
}

#[tauri::command]
pub async fn create_database_backup(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<crate::backups::DatabaseBackup, crate::app_error::AppError> {
    run_operation(app, environment_id, "database-backup", |app, id| {
        crate::backups::create(app, id)
    })
    .await
}

#[tauri::command]
pub async fn prune_database_backups(
    app: tauri::AppHandle,
    environment_id: String,
    keep: usize,
    max_total_mb: Option<u64>,
) -> Result<usize, String> {
    let max_total_bytes = max_total_mb.map(|value| value.saturating_mul(1024 * 1024));
    tauri::async_runtime::spawn_blocking(move || {
        crate::backups::prune(&app, &environment_id, keep, max_total_bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn restore_database_backup(
    app: tauri::AppHandle,
    environment_id: String,
    backup_id: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-restore", move |app, id| {
        crate::operations::progress_for_environment(
            app,
            id,
            5,
            "Creating automatic pre-restore backup",
        )?;
        crate::backups::create(app, id)?;
        crate::operations::progress_for_environment(app, id, 30, "Restoring selected backup")?;
        crate::backups::restore(app, id, &backup_id)
    })
    .await
}

#[tauri::command]
pub async fn delete_database_backup(
    app: tauri::AppHandle,
    environment_id: String,
    backup_id: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(
        app,
        environment_id,
        "database-backup-delete",
        move |app, id| crate::backups::delete(app, id, &backup_id),
    )
    .await
}

#[tauri::command]
pub async fn database_info(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<crate::backups::DatabaseInfo, String> {
    tauri::async_runtime::spawn_blocking(move || crate::backups::info(&app, &environment_id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn database_query(
    app: tauri::AppHandle,
    environment_id: String,
    sql: String,
) -> Result<String, crate::app_error::AppError> {
    run_operation(app, environment_id, "database-query", move |app, id| {
        if !crate::backups::query_is_read_only(&sql) {
            crate::operations::progress_for_environment(
                app,
                id,
                5,
                "Creating automatic pre-query backup",
            )?;
            crate::backups::create(app, id)?;
            crate::operations::progress_for_environment(app, id, 60, "Executing database query")?;
        }
        crate::backups::query(app, id, &sql)
    })
    .await
}

#[tauri::command]
pub async fn list_databases(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<Vec<crate::backups::DatabaseEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::backups::databases(&app, &environment_id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn create_database(
    app: tauri::AppHandle,
    environment_id: String,
    name: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-create", move |app, id| {
        crate::backups::create_database(app, id, &name)
    })
    .await
}

#[tauri::command]
pub async fn delete_database(
    app: tauri::AppHandle,
    environment_id: String,
    name: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-delete", move |app, id| {
        crate::backups::delete_database(app, id, &name)
    })
    .await
}

#[tauri::command]
pub async fn import_database_file(
    app: tauri::AppHandle,
    environment_id: String,
    path: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-import", move |app, id| {
        crate::operations::progress_for_environment(
            app,
            id,
            5,
            "Creating automatic pre-import backup",
        )?;
        crate::backups::create(app, id)?;
        crate::operations::progress_for_environment(app, id, 35, "Importing SQL dump")?;
        crate::backups::import_sql_file(app, id, Path::new(&path))
    })
    .await
}

#[tauri::command]
pub async fn list_dump_file_tables(path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::backups::list_dump_tables(Path::new(&path)))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn import_database_tables(
    app: tauri::AppHandle,
    environment_id: String,
    path: String,
    tables: Vec<String>,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-import", move |app, id| {
        crate::operations::progress_for_environment(
            app,
            id,
            5,
            "Creating automatic pre-import backup",
        )?;
        crate::backups::create(app, id)?;
        crate::operations::progress_for_environment(app, id, 35, "Importing selected tables")?;
        crate::backups::import_sql_file_for_tables(app, id, Path::new(&path), &tables)
    })
    .await
}

#[tauri::command]
pub async fn export_database_file(
    app: tauri::AppHandle,
    environment_id: String,
    path: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-export", move |app, id| {
        crate::backups::export_sql_file(app, id, Path::new(&path))
    })
    .await
}

#[tauri::command]
pub async fn list_database_tables(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::backups::list_tables(&app, &environment_id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn export_database_tables(
    app: tauri::AppHandle,
    environment_id: String,
    path: String,
    tables: Vec<String>,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-export", move |app, id| {
        crate::backups::export_sql_file_for_tables(app, id, Path::new(&path), &tables)
    })
    .await
}

#[tauri::command]
pub async fn clear_database(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-clear", move |app, id| {
        crate::operations::progress_for_environment(
            app,
            id,
            5,
            "Creating automatic pre-clear backup",
        )?;
        crate::backups::create(app, id)?;
        crate::operations::progress_for_environment(app, id, 55, "Clearing project database")?;
        crate::backups::clear_database(app, id)
    })
    .await
}

#[tauri::command]
pub async fn clone_database(
    app: tauri::AppHandle,
    environment_id: String,
    source: String,
    target: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-clone", move |app, id| {
        crate::operations::progress_for_environment(app, id, 10, "Cloning database")?;
        crate::backups::clone_database(app, id, &source, &target)?;
        crate::operations::progress_for_environment(app, id, 95, "Database cloned")
    })
    .await
}

#[tauri::command]
pub async fn rename_database(
    app: tauri::AppHandle,
    environment_id: String,
    source: String,
    target: String,
) -> Result<(), crate::app_error::AppError> {
    run_operation(app, environment_id, "database-rename", move |app, id| {
        crate::operations::progress_for_environment(
            app,
            id,
            10,
            "Copying database to its new name",
        )?;
        crate::backups::rename_database(app, id, &source, &target)?;
        crate::operations::progress_for_environment(app, id, 95, "Database renamed")
    })
    .await
}

pub(crate) async fn run_operation<T: Send + 'static>(
    app: tauri::AppHandle,
    environment_id: String,
    kind: &str,
    task: impl FnOnce(&tauri::AppHandle, &str) -> Result<T, String> + Send + 'static,
) -> Result<T, crate::app_error::AppError> {
    let operation = crate::operations::create(&app, Some(&environment_id), kind)?;
    let operation_id = operation.id.clone();
    let worker = app.clone();
    let redaction_environment_id = environment_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || task(&worker, &environment_id))
        .await
        .map_err(|error| error.to_string())?;
    let result = result.map_err(|error| {
        crate::security::environment_error(&app, &redaction_environment_id, &error)
    });
    match &result {
        Ok(_) => crate::operations::complete(&app, &operation_id)?,
        Err(error) => crate::operations::fail(&app, &operation_id, error)?,
    }
    crate::app_error::AppError::operation_result(result, operation_id)
}
