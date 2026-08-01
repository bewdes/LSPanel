#[tauri::command]
pub async fn inspect_environment(
    app: tauri::AppHandle,
    id: String,
) -> Result<crate::containers::EnvironmentInspection, String> {
    tauri::async_runtime::spawn_blocking(move || crate::containers::inspect_environment(&app, &id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn environment_status(
    app: tauri::AppHandle,
    id: String,
) -> Result<crate::containers::EnvironmentState, String> {
    tauri::async_runtime::spawn_blocking(move || crate::containers::environment_status(&app, &id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn environment_resources(
    app: tauri::AppHandle,
    id: String,
) -> Result<Vec<crate::containers::ServiceInspection>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::containers::environment_resources(&app, &id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn diagnose_environment(
    app: tauri::AppHandle,
    id: String,
) -> Result<crate::diagnose::Diagnosis, String> {
    tauri::async_runtime::spawn_blocking(move || crate::diagnose::environment(&app, &id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn environment_logs(app: tauri::AppHandle, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::containers::environment_logs(&app, &id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn operate_environment_service(
    app: tauri::AppHandle,
    id: String,
    service: String,
    action: String,
) -> Result<crate::containers::EnvironmentOperation, crate::app_error::AppError> {
    let worker = app.clone();
    let notify_service = service.clone();
    let notify_action = action.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::containers::operate_service(&worker, &id, &service, &action)
    })
    .await
    .map_err(|error| crate::app_error::AppError::from(error.to_string()))?;
    if result.is_ok() {
        crate::notifications::send_localized(
            &app,
            "container-service",
            &format!("Сервіс «{notify_service}»: {notify_action}"),
            &format!("Service \"{notify_service}\": {notify_action}"),
        );
    }
    result.map_err(Into::into)
}

#[tauri::command]
pub async fn environment_service_configuration(
    app: tauri::AppHandle,
    id: String,
    service: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::containers::service_configuration(&app, &id, &service)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn execute_environment_service_command(
    app: tauri::AppHandle,
    id: String,
    service: String,
    command: Vec<String>,
) -> Result<String, crate::app_error::AppError> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::containers::execute_service_command(&app, &id, &service, command)
    })
    .await
    .map_err(|error| crate::app_error::AppError::from(error.to_string()))?;
    result.map_err(Into::into)
}

#[tauri::command]
pub async fn clear_environment_service_logs(
    app: tauri::AppHandle,
    id: String,
    service: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::containers::clear_service_logs(&app, &id, &service)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn environment_service_url(
    app: tauri::AppHandle,
    id: String,
    service: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::containers::service_url(&app, &id, &service)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn environment_topology(app: tauri::AppHandle, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::containers::environment_topology(&app, &id))
        .await
        .map_err(|error| error.to_string())?
}
