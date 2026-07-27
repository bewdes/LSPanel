use rusqlite::params;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCommand {
    pub id: i64,
    pub site_id: String,
    pub label: String,
    pub command: String,
    pub service: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandHistoryEntry {
    pub id: i64,
    pub site_id: String,
    pub service: String,
    pub command: String,
    pub executed_at: i64,
}

pub fn list(app: &tauri::AppHandle, site_id: &str) -> Result<Vec<SavedCommand>, String> {
    let connection = crate::storage::connection(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, site_id, label, command, service
             FROM saved_commands WHERE site_id = ?1 ORDER BY id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([site_id], |row| {
            Ok(SavedCommand {
                id: row.get(0)?,
                site_id: row.get(1)?,
                label: row.get(2)?,
                command: row.get(3)?,
                service: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn save(
    app: &tauri::AppHandle,
    site_id: &str,
    label: &str,
    command: &str,
    service: &str,
) -> Result<SavedCommand, String> {
    validate(label, command, service)?;
    if !crate::sites::list(app)?
        .iter()
        .any(|site| site.id == site_id)
    {
        return Err("Site not found".into());
    }
    let connection = crate::storage::connection(app)?;
    connection
        .execute(
            "INSERT INTO saved_commands(site_id, label, command, service, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5)",
            params![
                site_id,
                label.trim(),
                command.trim(),
                service,
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(SavedCommand {
        id: connection.last_insert_rowid(),
        site_id: site_id.into(),
        label: label.trim().into(),
        command: command.trim().into(),
        service: service.into(),
    })
}

pub fn delete(app: &tauri::AppHandle, site_id: &str, id: i64) -> Result<(), String> {
    let changed = crate::storage::connection(app)?
        .execute(
            "DELETE FROM saved_commands WHERE id = ?1 AND site_id = ?2",
            params![id, site_id],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("Saved command not found".into());
    }
    Ok(())
}

pub fn history(app: &tauri::AppHandle, site_id: &str) -> Result<Vec<CommandHistoryEntry>, String> {
    let connection = crate::storage::connection(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, site_id, service, command, executed_at
             FROM command_history WHERE site_id = ?1 ORDER BY id DESC LIMIT 100",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([site_id], |row| {
            Ok(CommandHistoryEntry {
                id: row.get(0)?,
                site_id: row.get(1)?,
                service: row.get(2)?,
                command: row.get(3)?,
                executed_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn record_history(
    app: &tauri::AppHandle,
    site_id: &str,
    service: &str,
    command: &str,
) -> Result<Option<CommandHistoryEntry>, String> {
    validate("History", command, service)?;
    if sensitive_command(command) {
        return Ok(None);
    }
    let executed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let connection = crate::storage::connection(app)?;
    connection
        .execute(
            "INSERT INTO command_history(site_id, service, command, executed_at)
             VALUES(?1, ?2, ?3, ?4)",
            params![site_id, service, command.trim(), executed_at],
        )
        .map_err(|error| error.to_string())?;
    let id = connection.last_insert_rowid();
    connection
        .execute(
            "DELETE FROM command_history WHERE site_id = ?1 AND id NOT IN
             (SELECT id FROM command_history WHERE site_id = ?1 ORDER BY id DESC LIMIT 100)",
            [site_id],
        )
        .map_err(|error| error.to_string())?;
    Ok(Some(CommandHistoryEntry {
        id,
        site_id: site_id.into(),
        service: service.into(),
        command: command.trim().into(),
        executed_at,
    }))
}

pub fn clear_history(app: &tauri::AppHandle, site_id: &str) -> Result<(), String> {
    crate::storage::connection(app)?
        .execute("DELETE FROM command_history WHERE site_id = ?1", [site_id])
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn sensitive_command(command: &str) -> bool {
    let command = command.to_ascii_lowercase();
    [
        "password=",
        "passwd=",
        "token=",
        "secret=",
        "api_key=",
        "apikey=",
    ]
    .iter()
    .any(|marker| command.contains(marker))
}

fn validate(label: &str, command: &str, service: &str) -> Result<(), String> {
    if label.trim().is_empty() || label.len() > 80 {
        return Err("Command label must contain 1–80 characters".into());
    }
    if command.trim().is_empty() || command.len() > 1000 || command.contains(['\r', '\n', '\0']) {
        return Err("Command must be a single line of at most 1000 characters".into());
    }
    if service.is_empty()
        || service.len() > 64
        || !service
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err("Invalid service for saved command".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{sensitive_command, validate};

    #[test]
    fn validates_saved_command_fields() {
        assert!(validate("Migrate", "php artisan migrate", "php").is_ok());
        assert!(validate("", "php -v", "php").is_err());
        assert!(validate("Unsafe", "first\nsecond", "web").is_err());
        assert!(validate("Invalid service", "php -v", "../web").is_err());
    }

    #[test]
    fn keeps_credentials_out_of_command_history() {
        assert!(sensitive_command("tool --token=secret"));
        assert!(sensitive_command("PASSWORD=hunter2 command"));
        assert!(!sensitive_command("php artisan migrate"));
    }
}
