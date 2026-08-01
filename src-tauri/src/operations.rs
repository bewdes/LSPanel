use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub environment_id: Option<String>,
    pub kind: String,
    pub status: String,
    pub progress: u8,
    pub stage: String,
    pub error: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn create(
    app: &tauri::AppHandle,
    environment_id: Option<&str>,
    kind: &str,
) -> Result<Operation, String> {
    if let Some(environment_id) = environment_id {
        let active = crate::storage::connection(app)?.query_row(
            "SELECT kind FROM operations WHERE environment_id=?1 AND status='running' ORDER BY started_at DESC LIMIT 1",
            params![environment_id], |row| row.get::<_, String>(0)
        ).optional().map_err(|error| error.to_string())?;
        if let Some(active) = active {
            return Err(format!(
                "The environment already has an active {active} operation"
            ));
        }
    }
    let started_at = now();
    let id = format!("op-{started_at}-{}", environment_id.unwrap_or("global"));
    let operation = Operation {
        id,
        environment_id: environment_id.map(str::to_owned),
        kind: kind.into(),
        status: "running".into(),
        progress: 0,
        stage: "Queued".into(),
        error: None,
        started_at,
        finished_at: None,
    };
    crate::storage::connection(app)?.execute(
        "INSERT INTO operations(id, environment_id, kind, status, progress, stage, started_at) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![operation.id, operation.environment_id, operation.kind, operation.status, operation.progress, operation.stage, operation.started_at]
    ).map_err(|error| error.to_string())?;
    let _ = app.emit("operation-started", &operation);
    Ok(operation)
}

pub fn progress_for_environment(
    app: &tauri::AppHandle,
    environment_id: &str,
    progress: u8,
    stage: &str,
) -> Result<(), String> {
    let connection = crate::storage::connection(app)?;
    let id = connection.query_row(
        "SELECT id FROM operations WHERE environment_id=?1 AND status='running' ORDER BY started_at DESC LIMIT 1",
        params![environment_id], |row| row.get::<_, String>(0)
    ).optional().map_err(|error| error.to_string())?;
    let Some(id) = id else {
        return Ok(());
    };
    connection
        .execute(
            "UPDATE operations SET progress=?2, stage=?3 WHERE id=?1",
            params![id, progress, stage],
        )
        .map_err(|error| error.to_string())?;
    if let Some(operation) = get(app, &id)? {
        let _ = app.emit("operation-progress", operation);
    }
    Ok(())
}

pub fn complete(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    crate::storage::connection(app)?.execute("UPDATE operations SET status='completed', progress=100, stage='Completed', finished_at=?2 WHERE id=?1", params![id, now()]).map_err(|error| error.to_string())?;
    if let Some(operation) = get(app, id)? {
        notify_operation(app, &operation);
        let _ = app.emit("operation-completed", operation);
    }
    Ok(())
}

pub fn fail(app: &tauri::AppHandle, id: &str, error: &str) -> Result<(), String> {
    let environment_id = get(app, id)?.and_then(|operation| operation.environment_id);
    let error = environment_id
        .as_deref()
        .map(|environment_id| crate::security::environment_error(app, environment_id, error))
        .unwrap_or_else(|| error.to_owned());
    crate::storage::connection(app)?.execute("UPDATE operations SET status='failed', stage='Failed', error=?2, finished_at=?3 WHERE id=?1", params![id, error, now()]).map_err(|value| value.to_string())?;
    if let Some(operation) = get(app, id)? {
        notify_operation(app, &operation);
        let _ = app.emit("operation-failed", operation);
    }
    Ok(())
}

fn notify_operation(app: &tauri::AppHandle, operation: &Operation) {
    let settings = crate::settings::load(app)
        .ok()
        .flatten()
        .unwrap_or_default();
    if !settings.notify_on_operations {
        return;
    }
    let uk = settings.language == "uk";
    let body = match operation.status.as_str() {
        "completed" if uk => format!("Операція «{}» завершена успішно", operation.kind),
        "completed" => format!("Operation \"{}\" completed successfully", operation.kind),
        "failed" if uk => format!("Операція «{}» завершилася помилкою", operation.kind),
        "failed" => format!("Operation \"{}\" failed", operation.kind),
        _ => return,
    };
    crate::notifications::send(app, "operation", "LS Panel", &body);
}

pub fn delete(app: &tauri::AppHandle, id: &str) -> Result<Vec<Operation>, String> {
    let operation = get(app, id)?.ok_or("Operation not found")?;
    if operation.status == "running" {
        return Err("Cannot remove an operation that is still running".into());
    }
    crate::storage::connection(app)?
        .execute("DELETE FROM operations WHERE id=?1", params![id])
        .map_err(|error| error.to_string())?;
    list(app)
}

pub fn clear(app: &tauri::AppHandle) -> Result<Vec<Operation>, String> {
    crate::storage::connection(app)?
        .execute(
            "DELETE FROM operations WHERE status != 'running'",
            params![],
        )
        .map_err(|error| error.to_string())?;
    list(app)
}

pub fn list(app: &tauri::AppHandle) -> Result<Vec<Operation>, String> {
    let connection = crate::storage::connection(app)?;
    let mut statement = connection.prepare("SELECT id, environment_id, kind, status, progress, stage, error, started_at, finished_at FROM operations ORDER BY started_at DESC LIMIT 100").map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn recover_interrupted(app: &tauri::AppHandle) -> Result<(), String> {
    let finished_at = now();
    crate::storage::connection(app)?.execute(
        "UPDATE operations SET status='interrupted', stage='Interrupted by application restart', error='LS Panel was closed before the operation completed', finished_at=?1 WHERE status='running'",
        params![finished_at]
    ).map(|_| ()).map_err(|error| error.to_string())
}

fn get(app: &tauri::AppHandle, id: &str) -> Result<Option<Operation>, String> {
    crate::storage::connection(app)?.query_row("SELECT id, environment_id, kind, status, progress, stage, error, started_at, finished_at FROM operations WHERE id=?1", params![id], from_row).optional().map_err(|error| error.to_string())
}

fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Operation> {
    Ok(Operation {
        id: row.get(0)?,
        environment_id: row.get(1)?,
        kind: row.get(2)?,
        status: row.get(3)?,
        progress: row.get(4)?,
        stage: row.get(5)?,
        error: row.get(6)?,
        started_at: row.get(7)?,
        finished_at: row.get(8)?,
    })
}
