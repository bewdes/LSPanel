use tauri::Emitter;

#[tauri::command]
pub fn export_environment_logs(
    app: tauri::AppHandle,
    environment_id: String,
    path: String,
    text: String,
) -> Result<(), String> {
    if text.len() > 5 * 1024 * 1024 {
        return Err("Export is larger than the 5 MiB safety limit".into());
    }
    let path = std::path::PathBuf::from(path);
    if path.file_name().is_none() {
        return Err("Choose a valid export file".into());
    }
    let text = crate::security::environment_error(&app, &environment_id, &text);
    crate::security::write_private_file(&path, text.as_bytes())
}

#[tauri::command]
pub fn container_runtime_status(app: tauri::AppHandle) -> crate::containers::RuntimeStatus {
    let preferred = crate::settings::load(&app)
        .ok()
        .flatten()
        .map(|value| value.runtime);
    crate::containers::detect_runtime(preferred.as_deref())
}

#[tauri::command]
pub fn dependency_install_plan(
    tool: String,
) -> Result<crate::dependency_install::InstallPlan, String> {
    crate::dependency_install::plan(&tool)
}

#[tauri::command]
pub async fn install_dependency(app: tauri::AppHandle, tool: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::dependency_install::install(&app, &tool))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn container_runtimes_status() -> Vec<crate::containers::RuntimeStatus> {
    crate::containers::detect_runtimes()
}

#[tauri::command]
pub fn list_environments(
    app: tauri::AppHandle,
) -> Result<Vec<crate::containers::Environment>, String> {
    crate::containers::list(&app)
}

#[tauri::command]
pub fn list_generated_files(
    app: tauri::AppHandle,
    id: String,
) -> Result<Vec<crate::containers::GeneratedFile>, String> {
    crate::containers::generated_files(&app, &id)
}

#[tauri::command]
pub fn save_environment(
    app: tauri::AppHandle,
    environment: crate::containers::Environment,
) -> Result<Vec<crate::containers::Environment>, String> {
    let name = environment.name.clone();
    let result = crate::containers::save(&app, environment)?;
    crate::notifications::send_localized(
        &app,
        "environment-save",
        &format!("Середовище «{name}» збережено"),
        &format!("Environment \"{name}\" saved"),
    );
    let _ = app.emit("environments-changed", ());
    Ok(result)
}

#[tauri::command]
pub fn delete_environment(
    app: tauri::AppHandle,
    id: String,
) -> Result<Vec<crate::containers::Environment>, String> {
    let operation = crate::operations::create(&app, Some(&id), "delete-environment")?;
    let result = crate::containers::delete(&app, &id);
    match &result {
        Ok(_) => {
            crate::operations::complete(&app, &operation.id)?;
            let _ = app.emit("environments-changed", ());
        }
        Err(error) => crate::operations::fail(&app, &operation.id, error)?,
    }
    result
}

#[tauri::command]
pub async fn operate_environment(
    app: tauri::AppHandle,
    id: String,
    action: String,
) -> Result<crate::containers::EnvironmentOperation, crate::app_error::AppError> {
    let operation = crate::operations::create(&app, Some(&id), &action)?;
    let operation_id = operation.id.clone();
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if matches!(action.as_str(), "rebuild" | "rebuild-no-cache") {
            crate::operations::progress_for_environment(
                &worker_app,
                &id,
                2,
                "Creating automatic safety snapshot",
            )?;
            crate::snapshots::create_safety_for_environment(&worker_app, &id, &action)?;
        }
        // This is the only "stop" path (the Containers page acts on the
        // environment directly, unlike the Sites page's operate_site) that
        // used to leave every site's `enabled` flag untouched. Auto-heal
        // treats any environment with an enabled site as one that should be
        // running, so a stop issued from here was silently undone the next
        // time auto-heal ran (including immediately on the next app
        // launch), making a manually stopped project start again on its
        // own with no indication why.
        let enabling = matches!(
            action.as_str(),
            "start" | "restart" | "rebuild" | "rebuild-no-cache" | "unpause"
        );
        if enabling {
            crate::sites::set_environment_enabled(&worker_app, &id, true)?;
        } else if matches!(action.as_str(), "stop" | "kill" | "destroy") {
            crate::sites::set_environment_enabled(&worker_app, &id, false)?;
        }
        let outcome = crate::containers::operate(&worker_app, &id, &action);
        if enabling && outcome.is_err() {
            let _ = crate::sites::set_environment_enabled(&worker_app, &id, false);
        }
        outcome
    })
    .await
    .map_err(|error| error.to_string())?;
    let result = result.map_err(|error| {
        crate::security::environment_error(
            &app,
            &operation.environment_id.unwrap_or_default(),
            &error,
        )
    });
    match &result {
        Ok(_) => crate::operations::complete(&app, &operation_id)?,
        Err(error) => crate::operations::fail(&app, &operation_id, error)?,
    }
    result.map_err(|error| crate::app_error::AppError::with_operation(error, operation_id))
}

#[tauri::command]
pub fn list_operations(app: tauri::AppHandle) -> Result<Vec<crate::operations::Operation>, String> {
    crate::operations::list(&app)
}

#[tauri::command]
pub fn delete_operation(
    app: tauri::AppHandle,
    id: String,
) -> Result<Vec<crate::operations::Operation>, String> {
    crate::operations::delete(&app, &id)
}

#[tauri::command]
pub fn clear_operations(
    app: tauri::AppHandle,
) -> Result<Vec<crate::operations::Operation>, String> {
    crate::operations::clear(&app)
}

#[tauri::command]
pub fn list_notifications(
    app: tauri::AppHandle,
) -> Result<Vec<crate::notifications::AppNotification>, String> {
    crate::notifications::list(&app)
}

#[tauri::command]
pub fn delete_notification(
    app: tauri::AppHandle,
    id: String,
) -> Result<Vec<crate::notifications::AppNotification>, String> {
    crate::notifications::delete(&app, &id)
}

#[tauri::command]
pub fn mark_notifications_read(
    app: tauri::AppHandle,
) -> Result<Vec<crate::notifications::AppNotification>, String> {
    crate::notifications::mark_all_read(&app)
}

#[tauri::command]
pub fn clear_notifications(
    app: tauri::AppHandle,
) -> Result<Vec<crate::notifications::AppNotification>, String> {
    crate::notifications::clear(&app)
}

#[tauri::command]
pub async fn system_health(
    app: tauri::AppHandle,
) -> Result<crate::diagnostics::HealthReport, String> {
    tauri::async_runtime::spawn_blocking(move || crate::diagnostics::inspect(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn disk_usage(
    app: tauri::AppHandle,
) -> Result<Vec<crate::disk_usage::DiskUsageCategory>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::disk_usage::usage(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn workspace_free_space(path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || crate::disk_usage::free_space(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn prune_build_cache(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::disk_usage::prune_build_cache(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn prune_dangling_images(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::disk_usage::prune_dangling_images(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn project_health(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<crate::diagnostics::HealthReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::diagnostics::inspect_project(&app, &site_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn allocate_native_port() -> Result<u16, String> {
    crate::native_runtime::find_available_port()
}

#[tauri::command]
pub fn start_environment_log_stream(
    app: tauri::AppHandle,
    streams: tauri::State<'_, crate::logs::LogStreams>,
    environment_id: String,
    service: Option<String>,
) -> Result<String, String> {
    crate::logs::start(app, streams, environment_id, service)
}

#[tauri::command]
pub fn stop_environment_log_stream(
    streams: tauri::State<'_, crate::logs::LogStreams>,
    stream_id: String,
) -> Result<(), String> {
    crate::logs::stop(streams, stream_id)
}
