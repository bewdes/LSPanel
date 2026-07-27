async fn redact<T>(
    app: tauri::AppHandle,
    environment_id: String,
    task: impl FnOnce(&tauri::AppHandle, &str) -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    let worker = app.clone();
    let id = environment_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || task(&worker, &id))
        .await
        .map_err(|error| error.to_string())?;
    result.map_err(|error| crate::security::environment_error(&app, &environment_id, &error))
}

#[tauri::command]
pub async fn list_mailpit_messages(
    app: tauri::AppHandle,
    environment_id: String,
) -> Result<serde_json::Value, String> {
    redact(app, environment_id, crate::mailpit::messages).await
}

#[tauri::command]
pub async fn read_mailpit_message(
    app: tauri::AppHandle,
    environment_id: String,
    message_id: String,
) -> Result<serde_json::Value, String> {
    redact(app, environment_id, move |app, id| {
        crate::mailpit::message(app, id, &message_id)
    })
    .await
}

#[tauri::command]
pub async fn delete_mailpit_message(
    app: tauri::AppHandle,
    environment_id: String,
    message_id: String,
) -> Result<(), String> {
    redact(app, environment_id, move |app, id| {
        crate::mailpit::delete(app, id, &message_id)
    })
    .await
}

#[tauri::command]
pub async fn check_mailpit_message(
    app: tauri::AppHandle,
    environment_id: String,
    message_id: String,
) -> Result<serde_json::Value, String> {
    redact(app, environment_id, move |app, id| {
        crate::mailpit::checks(app, id, &message_id)
    })
    .await
}

#[tauri::command]
pub async fn release_mailpit_message(
    app: tauri::AppHandle,
    environment_id: String,
    message_id: String,
    recipients: Vec<String>,
) -> Result<(), String> {
    redact(app, environment_id, move |app, id| {
        crate::mailpit::release(app, id, &message_id, recipients)
    })
    .await
}
