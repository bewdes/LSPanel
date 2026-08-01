use rusqlite::params;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri_plugin_notification::NotificationExt;

/// How many notifications the in-app bell keeps around before trimming the
/// oldest ones — enough history to be useful without growing unbounded.
const MAX_STORED: usize = 200;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppNotification {
    pub id: String,
    pub category: String,
    pub title: String,
    pub body: String,
    pub created_at: i64,
    pub read: bool,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// The single entry point every background monitor and operation uses to
/// alert the user: records the notification for the in-app bell, shows a
/// desktop notification, and forwards it to the configured webhook (if any).
pub fn send(app: &tauri::AppHandle, category: &str, title: &str, body: &str) {
    record(app, category, title, body);
    let _ = app.notification().builder().title(title).body(body).show();
    crate::webhook::notify(app, body);
}

/// Convenience wrapper for the many quick, synchronous panel actions (save,
/// rename, delete, and so on) that just need one bilingual line — reads the
/// user's language preference and picks the matching body before sending.
pub fn send_localized(app: &tauri::AppHandle, category: &str, body_uk: &str, body_en: &str) {
    let uk = crate::settings::load(app)
        .ok()
        .flatten()
        .map(|settings| settings.language == "uk")
        .unwrap_or(false);
    send(
        app,
        category,
        "LS Panel",
        if uk { body_uk } else { body_en },
    );
}

fn record(app: &tauri::AppHandle, category: &str, title: &str, body: &str) {
    let Ok(connection) = crate::storage::connection(app) else {
        return;
    };
    let created_at = now();
    let notification = AppNotification {
        id: format!("notif-{created_at}-{category}"),
        category: category.into(),
        title: title.into(),
        body: body.into(),
        created_at,
        read: false,
    };
    let inserted = connection
        .execute(
            "INSERT INTO notifications(id, category, title, body, created_at, read) VALUES(?1, ?2, ?3, ?4, ?5, 0)",
            params![
                notification.id,
                notification.category,
                notification.title,
                notification.body,
                notification.created_at
            ],
        )
        .is_ok();
    let _ = connection.execute(
        "DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY created_at DESC LIMIT ?1)",
        params![MAX_STORED as i64],
    );
    if inserted {
        let _ = app.emit("notification-created", &notification);
    }
}

pub fn list(app: &tauri::AppHandle) -> Result<Vec<AppNotification>, String> {
    let connection = crate::storage::connection(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, category, title, body, created_at, read FROM notifications ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![MAX_STORED as i64], |row| {
            Ok(AppNotification {
                id: row.get(0)?,
                category: row.get(1)?,
                title: row.get(2)?,
                body: row.get(3)?,
                created_at: row.get(4)?,
                read: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn delete(app: &tauri::AppHandle, id: &str) -> Result<Vec<AppNotification>, String> {
    crate::storage::connection(app)?
        .execute("DELETE FROM notifications WHERE id=?1", params![id])
        .map_err(|error| error.to_string())?;
    list(app)
}

pub fn mark_all_read(app: &tauri::AppHandle) -> Result<Vec<AppNotification>, String> {
    crate::storage::connection(app)?
        .execute("UPDATE notifications SET read=1 WHERE read=0", params![])
        .map_err(|error| error.to_string())?;
    list(app)
}

pub fn clear(app: &tauri::AppHandle) -> Result<Vec<AppNotification>, String> {
    crate::storage::connection(app)?
        .execute("DELETE FROM notifications", params![])
        .map_err(|error| error.to_string())?;
    list(app)
}
