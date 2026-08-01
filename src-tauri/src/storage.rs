use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::Value;
use std::{fs, path::PathBuf};
use tauri::Manager;

const CURRENT_SCHEMA_VERSION: u32 = 2;

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn connect(app: &tauri::AppHandle) -> Result<Connection, String> {
    let directory = data_dir(app)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let mut connection =
        Connection::open(directory.join("lspanel.sqlite3")).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;",
        )
        .map_err(|error| error.to_string())?;
    migrate_schema(&mut connection)?;
    Ok(connection)
}

fn migrate_schema(connection: &mut Connection) -> Result<(), String> {
    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
        .map_err(|error| format!("Failed to read database schema version: {error}"))?;
    if version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "Database schema version {version} is newer than this LS Panel supports ({CURRENT_SCHEMA_VERSION})"
        ));
    }

    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start database migration: {error}"))?;
    // Every versioned step so far is a purely additive, idempotent set of
    // `CREATE TABLE/INDEX IF NOT EXISTS` statements. Re-running all of them
    // unconditionally on every launch (rather than gating each one behind
    // `version < N`) makes schema creation self-healing: if `user_version`
    // ever ends up recorded ahead of what actually got created — e.g. a
    // build was replaced mid-migration during development — the next
    // launch still fills in whatever tables are missing instead of being
    // permanently skipped. A future migration that isn't idempotent (a data
    // transformation, a column rename) would need its own `version < N`
    // guard here instead of being folded into this pattern.
    migrate_schema_v1(&transaction)?;
    migrate_schema_v2(&transaction)?;
    if version != CURRENT_SCHEMA_VERSION {
        transaction
            .pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)
            .map_err(|error| format!("Failed to record database schema version: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("Failed to commit database migration: {error}"))
}

fn migrate_schema_v1(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction.execute_batch(
        "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS environments (id TEXT PRIMARY KEY, data TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS sites (
           id TEXT PRIMARY KEY,
           environment_id TEXT NOT NULL,
           domain TEXT NOT NULL UNIQUE,
           data TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_sites_environment ON sites(environment_id);
         CREATE TABLE IF NOT EXISTS operations (
           id TEXT PRIMARY KEY,
           environment_id TEXT,
           kind TEXT NOT NULL,
           status TEXT NOT NULL,
           progress INTEGER NOT NULL DEFAULT 0,
           stage TEXT NOT NULL DEFAULT '',
           error TEXT,
           started_at INTEGER NOT NULL,
           finished_at INTEGER
         );
         CREATE INDEX IF NOT EXISTS idx_operations_started ON operations(started_at DESC);
         CREATE UNIQUE INDEX IF NOT EXISTS idx_operations_one_active ON operations(environment_id) WHERE status = 'running';
         CREATE TABLE IF NOT EXISTS saved_commands (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
           label TEXT NOT NULL,
           command TEXT NOT NULL,
           service TEXT NOT NULL,
           created_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_saved_commands_site ON saved_commands(site_id, id);
         CREATE TABLE IF NOT EXISTS command_history (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
           service TEXT NOT NULL,
           command TEXT NOT NULL,
           executed_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_command_history_site ON command_history(site_id, id DESC);"
    )
    .map_err(|error| format!("Failed to migrate database schema to version 1: {error}"))
}

fn migrate_schema_v2(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS notifications (
           id TEXT PRIMARY KEY,
           category TEXT NOT NULL,
           title TEXT NOT NULL,
           body TEXT NOT NULL,
           created_at INTEGER NOT NULL,
           read INTEGER NOT NULL DEFAULT 0
         );
         CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);",
        )
        .map_err(|error| format!("Failed to migrate database schema to version 2: {error}"))
}

pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    let mut connection = connect(app)?;
    let migrated = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'json_migration_v1'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .is_some();
    if migrated {
        return Ok(());
    }
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    migrate_settings(app, &transaction)?;
    migrate_collection(app, &transaction, "environments.json", "environments")?;
    migrate_collection(app, &transaction, "sites.json", "sites")?;
    transaction
        .execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES('json_migration_v1', 'complete')",
            [],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn migrate_settings(app: &tauri::AppHandle, transaction: &Transaction<'_>) -> Result<(), String> {
    let path = data_dir(app)?.join("settings.json");
    if !path.exists() {
        return Ok(());
    }
    let data = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str::<Value>(&data)
        .map_err(|error| format!("Invalid legacy settings: {error}"))?;
    transaction
        .execute(
            "INSERT OR IGNORE INTO settings(id, data) VALUES(1, ?1)",
            params![data],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn migrate_collection(
    app: &tauri::AppHandle,
    transaction: &Transaction<'_>,
    file: &str,
    table: &str,
) -> Result<(), String> {
    let path = data_dir(app)?.join(file);
    if !path.exists() {
        return Ok(());
    }
    let values: Vec<Value> =
        serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("Invalid legacy {file}: {error}"))?;
    for value in values {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("Legacy {file} entry has no id"))?;
        let data = serde_json::to_string(&value).map_err(|error| error.to_string())?;
        if table == "sites" {
            let environment_id = value
                .get("environmentId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let domain = value
                .get("domain")
                .and_then(Value::as_str)
                .unwrap_or_default();
            transaction.execute("INSERT OR IGNORE INTO sites(id, environment_id, domain, data) VALUES(?1, ?2, ?3, ?4)", params![id, environment_id, domain, data]).map_err(|error| error.to_string())?;
        } else {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO environments(id, data) VALUES(?1, ?2)",
                    params![id, data],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn load_settings(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    initialize(app)?;
    connect(app)?
        .query_row("SELECT data FROM settings WHERE id = 1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| error.to_string())
}

pub fn save_settings(app: &tauri::AppHandle, data: &str) -> Result<(), String> {
    initialize(app)?;
    connect(app)?.execute("INSERT INTO settings(id, data) VALUES(1, ?1) ON CONFLICT(id) DO UPDATE SET data = excluded.data", params![data]).map(|_| ()).map_err(|error| error.to_string())
}

pub fn list_environments(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    initialize(app)?;
    query_data(
        connect(app)?,
        "SELECT data FROM environments ORDER BY rowid",
    )
}

pub fn save_environment(app: &tauri::AppHandle, id: &str, data: &str) -> Result<(), String> {
    initialize(app)?;
    connect(app)?.execute("INSERT INTO environments(id, data) VALUES(?1, ?2) ON CONFLICT(id) DO UPDATE SET data = excluded.data", params![id, data]).map(|_| ()).map_err(|error| error.to_string())
}

pub fn delete_environment(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    initialize(app)?;
    let mut connection = connect(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM sites WHERE environment_id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM environments WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

pub fn list_sites(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    initialize(app)?;
    query_data(connect(app)?, "SELECT data FROM sites ORDER BY rowid")
}

pub fn save_site(
    app: &tauri::AppHandle,
    id: &str,
    environment_id: &str,
    domain: &str,
    data: &str,
) -> Result<(), String> {
    initialize(app)?;
    connect(app)?.execute("INSERT INTO sites(id, environment_id, domain, data) VALUES(?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET environment_id = excluded.environment_id, domain = excluded.domain, data = excluded.data", params![id, environment_id, domain, data]).map(|_| ()).map_err(|error| error.to_string())
}

pub fn delete_site(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    initialize(app)?;
    connect(app)?
        .execute("DELETE FROM sites WHERE id = ?1", params![id])
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn query_data(connection: Connection, query: &str) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare(query)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub(crate) fn connection(app: &tauri::AppHandle) -> Result<Connection, String> {
    initialize(app)?;
    connect(app)
}

#[cfg(test)]
mod tests {
    use super::{migrate_schema, CURRENT_SCHEMA_VERSION};
    use rusqlite::Connection;

    fn schema_version(connection: &Connection) -> u32 {
        connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn creates_a_versioned_schema_on_a_fresh_database() {
        let mut connection = Connection::open_in_memory().unwrap();

        migrate_schema(&mut connection).unwrap();

        assert_eq!(schema_version(&connection), CURRENT_SCHEMA_VERSION);
        let table_count: u32 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
                    'metadata', 'settings', 'environments', 'sites', 'operations',
                    'saved_commands', 'command_history', 'notifications'
                )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 8);
    }

    #[test]
    fn upgrades_a_v1_database_to_add_the_notifications_table() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate_schema(&mut connection).unwrap();
        // Simulate a real installation that already migrated to v1 before the
        // notifications table existed: drop it and roll the version back, the
        // same shape a pre-upgrade database would have on disk.
        connection
            .execute_batch("DROP TABLE notifications;")
            .unwrap();
        connection
            .pragma_update(None, "user_version", 1u32)
            .unwrap();

        migrate_schema(&mut connection).unwrap();

        assert_eq!(schema_version(&connection), CURRENT_SCHEMA_VERSION);
        let table_exists: u32 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'notifications'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_exists, 1);
    }

    #[test]
    fn heals_a_database_whose_recorded_version_outran_its_actual_tables() {
        // Reproduces a real drift that happened during development: the
        // stored user_version said "2" but the notifications table was
        // never actually created (a build got replaced mid-migration).
        // Schema creation must not trust the version number alone.
        let mut connection = Connection::open_in_memory().unwrap();
        migrate_schema(&mut connection).unwrap();
        connection
            .execute_batch("DROP TABLE notifications;")
            .unwrap();
        assert_eq!(schema_version(&connection), CURRENT_SCHEMA_VERSION);

        migrate_schema(&mut connection).unwrap();

        let table_exists: u32 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'notifications'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_exists, 1);
    }

    #[test]
    fn upgrades_an_existing_unversioned_beta_database_without_losing_data() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE environments (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                 INSERT INTO environments(id, data) VALUES('legacy', '{\"id\":\"legacy\"}');",
            )
            .unwrap();

        migrate_schema(&mut connection).unwrap();

        assert_eq!(schema_version(&connection), CURRENT_SCHEMA_VERSION);
        let data: String = connection
            .query_row(
                "SELECT data FROM environments WHERE id = 'legacy'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(data, "{\"id\":\"legacy\"}");
    }

    #[test]
    fn rejects_databases_created_by_a_newer_application_version() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION + 1)
            .unwrap();

        let error = migrate_schema(&mut connection).unwrap_err();

        assert!(error.contains("newer than this LS Panel supports"));
    }
}
