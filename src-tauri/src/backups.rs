use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::Stdio,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseBackup {
    pub id: String,
    pub environment_id: String,
    pub database: String,
    pub size: u64,
    pub created_at: i64,
    pub path: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub connected: bool,
    pub size: String,
    pub engine: String,
    pub version: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseEntry {
    pub name: String,
    pub size: String,
    pub connections: u32,
    pub configured: bool,
    pub system: bool,
}

pub fn databases(
    app: &tauri::AppHandle,
    environment_id: &str,
) -> Result<Vec<DatabaseEntry>, String> {
    let environment = environment(app, environment_id)?;
    let sql = if environment.database == "PostgreSQL" {
        "SELECT datname, pg_size_pretty(pg_database_size(datname)), (SELECT count(*) FROM pg_stat_activity a WHERE a.datname=d.datname) FROM pg_database d WHERE datistemplate=false ORDER BY datname;"
    } else {
        "SELECT s.SCHEMA_NAME, CONCAT(ROUND(COALESCE(SUM(t.DATA_LENGTH+t.INDEX_LENGTH),0)/1024/1024,2),' MiB'), COALESCE(p.connections,0) FROM information_schema.SCHEMATA s LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=s.SCHEMA_NAME LEFT JOIN (SELECT DB, COUNT(*) connections FROM information_schema.PROCESSLIST WHERE DB IS NOT NULL GROUP BY DB) p ON p.DB=s.SCHEMA_NAME GROUP BY s.SCHEMA_NAME,p.connections ORDER BY s.SCHEMA_NAME;"
    };
    let separator = if environment.database == "PostgreSQL" {
        '|'
    } else {
        '\t'
    };
    query(app, environment_id, sql).map(|output| {
        output
            .lines()
            .filter_map(|line| {
                let mut fields = line.split(separator);
                let name = fields.next()?.trim().to_owned();
                let size = fields.next()?.trim().to_owned();
                let connections = fields.next()?.trim().parse().unwrap_or(0);
                let system = matches!(
                    name.as_str(),
                    "information_schema" | "mysql" | "performance_schema" | "sys" | "postgres"
                );
                Some(DatabaseEntry {
                    configured: name == environment.database_name,
                    name,
                    size,
                    connections,
                    system,
                })
            })
            .collect()
    })
}

pub fn create_database(
    app: &tauri::AppHandle,
    environment_id: &str,
    name: &str,
) -> Result<(), String> {
    let environment = environment(app, environment_id)?;
    let name = valid_database_name(name)?;
    let sql = if environment.database == "PostgreSQL" {
        format!("CREATE DATABASE \"{name}\";")
    } else {
        format!("CREATE DATABASE `{name}`;")
    };
    query(app, environment_id, &sql).map(|_| ())
}

pub fn delete_database(
    app: &tauri::AppHandle,
    environment_id: &str,
    name: &str,
) -> Result<(), String> {
    let environment = environment(app, environment_id)?;
    let name = valid_database_name(name)?;
    if name == environment.database_name {
        return Err("The configured project database cannot be deleted".into());
    }
    if matches!(
        name,
        "information_schema" | "mysql" | "performance_schema" | "sys" | "postgres"
    ) {
        return Err("System databases cannot be deleted".into());
    }
    let sql = if environment.database == "PostgreSQL" {
        format!("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{name}' AND pid <> pg_backend_pid();\nDROP DATABASE \"{name}\";")
    } else {
        format!("DROP DATABASE `{name}`;")
    };
    query(app, environment_id, &sql).map(|_| ())
}

pub fn clear_database(app: &tauri::AppHandle, environment_id: &str) -> Result<(), String> {
    let environment = environment(app, environment_id)?;
    let sql = clear_database_sql(&environment)?;
    query(app, environment_id, &sql).map(|_| ())
}

pub fn clone_database(
    app: &tauri::AppHandle,
    environment_id: &str,
    source: &str,
    target: &str,
) -> Result<(), String> {
    let environment = environment(app, environment_id)?;
    let source = valid_database_name(source)?;
    let target = valid_database_name(target)?;
    if source == target {
        return Err("Clone database name must differ from the source".into());
    }
    let existing = databases(app, environment_id)?;
    if !existing.iter().any(|database| database.name == source) {
        return Err("Source database does not exist".into());
    }
    if existing.iter().any(|database| database.name == target) {
        return Err("Target database already exists".into());
    }
    let (runtime, stack) = context(app, environment_id)?;
    let directory = backup_directory(app, environment_id)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let temporary = directory.join(format!(".clone-{}.sql", std::process::id()));
    let _ = fs::remove_file(&temporary);
    let dump_file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    let dump = crate::containers::runtime_command(&runtime)
        .args(dump_args_for(&environment, source))
        .current_dir(&stack)
        .stdin(Stdio::null())
        .stdout(Stdio::from(dump_file))
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let dump_output = crate::process::child_output(
        dump,
        crate::process::DATABASE_TIMEOUT,
        "database clone export",
    )?;
    if !dump_output.status.success() {
        let _ = fs::remove_file(&temporary);
        return Err(redact(
            &environment,
            &String::from_utf8_lossy(&dump_output.stderr),
        ));
    }
    create_database(app, environment_id, target)?;
    let input = fs::File::open(&temporary).map_err(|error| error.to_string())?;
    let restore = crate::containers::runtime_command(&runtime)
        .args(restore_args_for(&environment, target))
        .current_dir(stack)
        .stdin(Stdio::from(input))
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn();
    let restore = match restore {
        Ok(child) => child,
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            let _ = delete_database(app, environment_id, target);
            return Err(error.to_string());
        }
    };
    let restored = crate::process::child_output(
        restore,
        crate::process::DATABASE_TIMEOUT,
        "database clone import",
    );
    let _ = fs::remove_file(&temporary);
    match restored {
        Ok(output) if output.status.success() => Ok(()),
        result => {
            let _ = delete_database(app, environment_id, target);
            match result {
                Ok(output) => Err(redact(
                    &environment,
                    &String::from_utf8_lossy(&output.stderr),
                )),
                Err(error) => Err(error),
            }
        }
    }
}

pub fn rename_database(
    app: &tauri::AppHandle,
    environment_id: &str,
    source: &str,
    target: &str,
) -> Result<(), String> {
    let environment = environment(app, environment_id)?;
    let source = valid_database_name(source)?;
    let target = valid_database_name(target)?;
    if source == environment.database_name {
        return Err(
            "Rename the configured project database through a full environment migration".into(),
        );
    }
    let entry = databases(app, environment_id)?
        .into_iter()
        .find(|database| database.name == source)
        .ok_or("Source database does not exist")?;
    if entry.system {
        return Err("System databases cannot be renamed".into());
    }
    clone_database(app, environment_id, source, target)?;
    if let Err(error) = delete_database(app, environment_id, source) {
        let rollback = delete_database(app, environment_id, target);
        return Err(match rollback {
            Ok(()) => format!("Database rename was rolled back: {error}"),
            Err(rollback_error) => format!(
                "Database rename could not remove the source ({error}); the cloned target also could not be rolled back ({rollback_error})"
            ),
        });
    }
    Ok(())
}

fn clear_database_sql(environment: &crate::containers::Environment) -> Result<String, String> {
    let name = valid_database_name(&environment.database_name)?;
    if environment.database == "PostgreSQL" {
        Ok(format!(
            "DROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\nGRANT ALL ON SCHEMA public TO \"{}\";\nGRANT ALL ON SCHEMA public TO public;",
            environment.database_user
        ))
    } else {
        let charset = environment
            .environment_variables
            .get("DB_CHARSET")
            .filter(|value| {
                !value.is_empty()
                    && value
                        .chars()
                        .all(|character| character.is_ascii_alphanumeric() || character == '_')
            })
            .map(String::as_str)
            .unwrap_or("utf8mb4");
        Ok(format!(
            "DROP DATABASE `{name}`;\nCREATE DATABASE `{name}` CHARACTER SET {charset};\nGRANT ALL PRIVILEGES ON `{name}`.* TO '{}'@'%';\nFLUSH PRIVILEGES;",
            environment.database_user
        ))
    }
}

fn valid_database_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 63
        || !name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
        || name
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_digit())
    {
        return Err("Database name must start with a letter and contain only letters, digits and underscores".into());
    }
    Ok(name)
}

pub fn query(app: &tauri::AppHandle, environment_id: &str, sql: &str) -> Result<String, String> {
    if sql.trim().is_empty() {
        return Err("SQL query is empty".into());
    }
    if sql.len() > 100_000 {
        return Err("SQL query is too large".into());
    }
    let environment = environment(app, environment_id)?;
    let (runtime, stack) = context(app, environment_id)?;
    let args = client_args(&environment);
    let mut child = crate::containers::runtime_command(&runtime)
        .args(args)
        .current_dir(stack)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    child
        .stdin
        .take()
        .ok_or("Database stdin is unavailable")?
        .write_all(sql.as_bytes())
        .map_err(|error| error.to_string())?;
    let output =
        crate::process::child_output(child, crate::process::DATABASE_TIMEOUT, "database query")?;
    if !output.status.success() {
        return Err(redact(
            &environment,
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(text.chars().take(1_000_000).collect())
}
pub fn info(app: &tauri::AppHandle, environment_id: &str) -> Result<DatabaseInfo, String> {
    let environment = environment(app, environment_id)?;
    let sql = if environment.database == "PostgreSQL" {
        format!(
            "SELECT pg_size_pretty(pg_database_size('{}'));",
            environment.database_name.replace('\'', "''")
        )
    } else {
        format!("SELECT CONCAT(ROUND(COALESCE(SUM(data_length+index_length),0)/1024/1024,2),' MiB') FROM information_schema.tables WHERE table_schema='{}';",environment.database_name.replace('\'',"''"))
    };
    let size = query(app, environment_id, &sql)?
        .lines()
        .rfind(|line| !line.trim().is_empty())
        .unwrap_or("0 B")
        .trim()
        .to_owned();
    Ok(DatabaseInfo {
        connected: true,
        size,
        engine: environment.database,
        version: environment.database_version,
    })
}
fn client_args(e: &crate::containers::Environment) -> Vec<String> {
    if e.database == "PostgreSQL" {
        vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "-e".into(),
            format!("PGPASSWORD={}", e.database_password),
            "database".into(),
            "psql".into(),
            "-X".into(),
            "-A".into(),
            "-t".into(),
            "-U".into(),
            e.database_user.clone(),
            "-d".into(),
            e.database_name.clone(),
        ]
    } else {
        vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "database".into(),
            if e.database == "MariaDB" {
                "mariadb".into()
            } else {
                "mysql".into()
            },
            "-N".into(),
            "-B".into(),
            "-uroot".into(),
            format!("-p{}", e.database_root_password),
            e.database_name.clone(),
        ]
    }
}

pub fn list(app: &tauri::AppHandle, environment_id: &str) -> Result<Vec<DatabaseBackup>, String> {
    let environment = environment(app, environment_id)?;
    let directory = backup_directory(app, environment_id)?;
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut backups = fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let id = path.file_name()?.to_str()?.to_owned();
            if !id.ends_with(".sql") {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            let created_at = metadata
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_millis() as i64;
            Some(DatabaseBackup {
                id,
                environment_id: environment_id.into(),
                database: environment.database.clone(),
                size: metadata.len(),
                created_at,
                path: path.display().to_string(),
            })
        })
        .collect::<Vec<_>>();
    backups.sort_by_key(|backup| std::cmp::Reverse(backup.created_at));
    Ok(backups)
}

pub fn create(app: &tauri::AppHandle, environment_id: &str) -> Result<DatabaseBackup, String> {
    crate::operations::progress_for_environment(
        app,
        environment_id,
        10,
        "Preparing database backup",
    )?;
    let environment = environment(app, environment_id)?;
    let (runtime, stack) = context(app, environment_id)?;
    let directory = backup_directory(app, environment_id)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let id = format!("{}-{timestamp}.sql", environment.database_name);
    let path = directory.join(&id);
    let temporary = path.with_extension("sql.tmp");
    let output_file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    crate::operations::progress_for_environment(app, environment_id, 35, "Exporting database")?;
    let args = dump_args(&environment);
    let child = crate::containers::runtime_command(&runtime)
        .args(args)
        .current_dir(stack)
        .stdin(Stdio::null())
        .stdout(Stdio::from(output_file))
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let output =
        crate::process::child_output(child, crate::process::DATABASE_TIMEOUT, "database backup")
            .inspect_err(|_| {
                let _ = fs::remove_file(&temporary);
            })?;
    if !output.status.success() {
        let _ = fs::remove_file(&temporary);
        return Err(redact(
            &environment,
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    crate::operations::progress_for_environment(app, environment_id, 85, "Finalizing backup")?;
    fs::rename(&temporary, &path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        error.to_string()
    })?;
    list(app, environment_id)?
        .into_iter()
        .find(|backup| backup.id == id)
        .ok_or("Backup file was not created".into())
}

pub fn restore(
    app: &tauri::AppHandle,
    environment_id: &str,
    backup_id: &str,
) -> Result<(), String> {
    crate::operations::progress_for_environment(
        app,
        environment_id,
        10,
        "Validating database backup",
    )?;
    let environment = environment(app, environment_id)?;
    let path = safe_backup_path(app, environment_id, backup_id)?;
    let input = fs::File::open(path).map_err(|error| error.to_string())?;
    let (runtime, stack) = context(app, environment_id)?;
    crate::operations::progress_for_environment(app, environment_id, 35, "Restoring database")?;
    let child = crate::containers::runtime_command(&runtime)
        .args(restore_args(&environment))
        .current_dir(stack)
        .stdin(Stdio::from(input))
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let output =
        crate::process::child_output(child, crate::process::DATABASE_TIMEOUT, "database restore")?;
    if output.status.success() {
        crate::operations::progress_for_environment(app, environment_id, 95, "Database restored")
    } else {
        Err(redact(
            &environment,
            &String::from_utf8_lossy(&output.stderr),
        ))
    }
}

pub fn restore_file(
    app: &tauri::AppHandle,
    environment_id: &str,
    path: &std::path::Path,
) -> Result<(), String> {
    let environment = environment(app, environment_id)?;
    if !path.is_file() {
        return Err("Snapshot database dump is missing".into());
    }
    let input = fs::File::open(path).map_err(|error| error.to_string())?;
    let (runtime, stack) = context(app, environment_id)?;
    let child = crate::containers::runtime_command(&runtime)
        .args(restore_args(&environment))
        .current_dir(stack)
        .stdin(Stdio::from(input))
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let output = crate::process::child_output(
        child,
        crate::process::DATABASE_TIMEOUT,
        "snapshot database restore",
    )?;
    if output.status.success() {
        Ok(())
    } else {
        Err(redact(
            &environment,
            &String::from_utf8_lossy(&output.stderr),
        ))
    }
}

pub fn import_sql_file(
    app: &tauri::AppHandle,
    environment_id: &str,
    path: &std::path::Path,
) -> Result<(), String> {
    if path.extension().and_then(|value| value.to_str()) != Some("sql") {
        return Err("Choose a .sql database dump".into());
    }
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() || metadata.len() == 0 {
        return Err("SQL import must be a non-empty regular file".into());
    }
    restore_file(app, environment_id, path)
}

pub fn export_sql_file(
    app: &tauri::AppHandle,
    environment_id: &str,
    destination: &std::path::Path,
) -> Result<(), String> {
    if destination.extension().and_then(|value| value.to_str()) != Some("sql") {
        return Err("Database export path must end with .sql".into());
    }
    if destination
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err("Database export cannot overwrite a symbolic link".into());
    }
    let parent = destination.parent().ok_or("Invalid database export path")?;
    if !parent.is_dir() {
        return Err("Database export directory does not exist".into());
    }
    let backup = create(app, environment_id)?;
    let temporary = parent.join(format!(".lspanel-export-{}.tmp", std::process::id()));
    let _ = fs::remove_file(&temporary);
    fs::copy(&backup.path, &temporary).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to export database: {error}")
    })?;
    if destination.is_file() {
        fs::remove_file(destination).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            format!("Failed to replace database export: {error}")
        })?;
    }
    fs::rename(&temporary, destination).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to finalize database export: {error}")
    })
}

pub fn delete(app: &tauri::AppHandle, environment_id: &str, backup_id: &str) -> Result<(), String> {
    fs::remove_file(safe_backup_path(app, environment_id, backup_id)?)
        .map_err(|error| error.to_string())
}

pub fn delete_all(app: &tauri::AppHandle, environment_id: &str) -> Result<(), String> {
    if !safe_resource_id(environment_id) {
        return Err("Invalid environment identifier".into());
    }
    let directory = backup_directory(app, environment_id)?;
    if directory.exists() {
        fs::remove_dir_all(directory).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn environment(app: &tauri::AppHandle, id: &str) -> Result<crate::containers::Environment, String> {
    crate::containers::list(app)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or("Environment not found".into())
}
fn backup_directory(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("backups")
        .join(id)
        .join("database"))
}
fn safe_resource_id(id: &str) -> bool {
    !id.is_empty() && id != "." && id != ".." && !id.contains('/') && !id.contains('\\')
}
pub fn copy_to_environment(
    app: &tauri::AppHandle,
    source: &DatabaseBackup,
    target_environment_id: &str,
) -> Result<String, String> {
    let directory = backup_directory(app, target_environment_id)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let target = directory.join(&source.id);
    copy_backup_file(std::path::Path::new(&source.path), &target)?;
    Ok(source.id.clone())
}

fn copy_backup_file(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
    let temporary = target.with_extension("sql.copying");
    let _ = fs::remove_file(&temporary);
    fs::copy(source, &temporary).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to copy database backup: {error}")
    })?;
    fs::rename(&temporary, target).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to finalize copied database backup: {error}")
    })
}
fn context(app: &tauri::AppHandle, id: &str) -> Result<(String, PathBuf), String> {
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let status = crate::containers::detect_runtime(preferred.as_deref());
    let runtime = status
        .runtime
        .filter(|_| status.running && status.compose_available)
        .ok_or(status.message)?;
    Ok((runtime, crate::containers::stack_directory(app, id)?))
}
fn valid_backup_id(id: &str) -> bool {
    !id.is_empty() && !id.contains('/') && !id.contains('\\') && id.ends_with(".sql")
}
fn safe_backup_path(
    app: &tauri::AppHandle,
    environment_id: &str,
    id: &str,
) -> Result<PathBuf, String> {
    if !valid_backup_id(id) {
        return Err("Invalid backup identifier".into());
    }
    let path = backup_directory(app, environment_id)?.join(id);
    if !path.is_file() {
        return Err("Backup not found".into());
    }
    Ok(path)
}
fn dump_args(e: &crate::containers::Environment) -> Vec<String> {
    dump_args_for(e, &e.database_name)
}
fn dump_args_for(e: &crate::containers::Environment, database: &str) -> Vec<String> {
    if e.database == "PostgreSQL" {
        vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "-e".into(),
            format!("PGPASSWORD={}", e.database_password),
            "database".into(),
            "pg_dump".into(),
            "-U".into(),
            e.database_user.clone(),
            "-d".into(),
            database.into(),
            "--clean".into(),
            "--if-exists".into(),
        ]
    } else {
        vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "database".into(),
            if e.database == "MariaDB" {
                "mariadb-dump".into()
            } else {
                "mysqldump".into()
            },
            "-uroot".into(),
            format!("-p{}", e.database_root_password),
            "--single-transaction".into(),
            "--routines".into(),
            "--triggers".into(),
            database.into(),
        ]
    }
}
fn restore_args(e: &crate::containers::Environment) -> Vec<String> {
    restore_args_for(e, &e.database_name)
}
fn restore_args_for(e: &crate::containers::Environment, database: &str) -> Vec<String> {
    if e.database == "PostgreSQL" {
        vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "-e".into(),
            format!("PGPASSWORD={}", e.database_password),
            "database".into(),
            "psql".into(),
            "-v".into(),
            "ON_ERROR_STOP=1".into(),
            "-U".into(),
            e.database_user.clone(),
            "-d".into(),
            database.into(),
        ]
    } else {
        vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "database".into(),
            if e.database == "MariaDB" {
                "mariadb".into()
            } else {
                "mysql".into()
            },
            "-uroot".into(),
            format!("-p{}", e.database_root_password),
            database.into(),
        ]
    }
}
fn redact(e: &crate::containers::Environment, text: &str) -> String {
    [&e.database_password, &e.database_root_password]
        .into_iter()
        .filter(|value| !value.is_empty())
        .fold(text.trim().to_owned(), |text, secret| {
            text.replace(secret, "••••••••")
        })
}

pub fn query_is_read_only(sql: &str) -> bool {
    let normalized = sql.trim_start().to_ascii_lowercase();
    ["select", "show", "describe", "desc", "explain", "pragma"]
        .iter()
        .any(|keyword| {
            normalized == *keyword
                || normalized.starts_with(&format!("{keyword} "))
                || normalized.starts_with(&format!("{keyword}\n"))
        })
}

#[cfg(test)]
mod tests {
    use super::{
        copy_backup_file, query_is_read_only, safe_resource_id, valid_backup_id,
        valid_database_name,
    };
    use std::fs;
    #[test]
    fn backup_ids_reject_traversal() {
        assert!(valid_backup_id("app-123.sql"));
        assert!(!valid_backup_id("../dump.sql"));
        assert!(!valid_backup_id("dump.txt"));
        assert!(safe_resource_id("env-123"));
        assert!(!safe_resource_id("../env"));
        assert!(!safe_resource_id(".."));
    }

    #[test]
    fn backup_copy_is_finalized_without_temporary_file() {
        let directory =
            std::env::temp_dir().join(format!("lspanel-backup-copy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("source.sql");
        let target = directory.join("target.sql");
        fs::write(&source, "SELECT 1;").unwrap();

        copy_backup_file(&source, &target).unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "SELECT 1;");
        assert!(!target.with_extension("sql.copying").exists());
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn classifies_database_queries() {
        assert!(query_is_read_only(" SELECT * FROM users"));
        assert!(query_is_read_only("SHOW TABLES"));
        assert!(!query_is_read_only("UPDATE users SET active=1"));
        assert!(!query_is_read_only("DROP TABLE users"));
    }

    #[test]
    fn database_names_cannot_inject_sql_identifiers() {
        assert_eq!(
            valid_database_name("analytics_2026").unwrap(),
            "analytics_2026"
        );
        assert!(valid_database_name("2analytics").is_err());
        assert!(valid_database_name("analytics; DROP DATABASE app").is_err());
        assert!(valid_database_name("../analytics").is_err());
    }
}
