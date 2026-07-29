use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub site_id: String,
    pub name: String,
    pub created_at: i64,
    pub size: u64,
    pub has_database: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotComparison {
    pub configuration_changes: Vec<String>,
    pub env_added: Vec<String>,
    pub env_removed: Vec<String>,
    pub env_changed: Vec<String>,
    pub snapshot_database_size: u64,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    site: crate::sites::Site,
    environment: crate::containers::Environment,
    name: String,
    created_at: i64,
    has_env: bool,
    #[serde(default = "default_true")]
    has_database: bool,
}

fn default_true() -> bool {
    true
}

fn root(app: &tauri::AppHandle, site_id: &str) -> Result<PathBuf, String> {
    if !safe_resource_id(site_id) {
        return Err("Invalid site identifier".into());
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("snapshots")
        .join(site_id))
}
fn safe_resource_id(id: &str) -> bool {
    !id.is_empty() && id != "." && id != ".." && !id.contains('/') && !id.contains('\\')
}
fn valid(id: &str) -> bool {
    !id.is_empty() && !id.contains('/') && !id.contains('\\') && id.starts_with("snapshot-")
}
pub fn create(app: &tauri::AppHandle, site_id: &str, name: &str) -> Result<Snapshot, String> {
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Environment not found")?;
    let running = crate::containers::environment_status(app, &environment.id)?.status == "running";
    let server_database = !matches!(
        environment.database.to_ascii_lowercase().as_str(),
        "" | "none" | "sqlite"
    );
    create_inner(app, site_id, name, running && server_database)
}

fn create_inner(
    app: &tauri::AppHandle,
    site_id: &str,
    name: &str,
    include_database: bool,
) -> Result<Snapshot, String> {
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Environment not found")?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let id = format!("snapshot-{timestamp}");
    let directory = root(app, site_id)?.join(&id);
    let environment_id = environment.id.clone();
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let mut temporary_backup_id = None;
    let result = (|| {
        if include_database {
            crate::operations::progress_for_environment(
                app,
                &environment.id,
                10,
                "Exporting snapshot database",
            )?;
            let database = crate::backups::create(app, &environment.id)?;
            temporary_backup_id = Some(database.id.clone());
            fs::copy(database.path, directory.join("database.sql"))
                .map_err(|error| error.to_string())?;
        }
        let env = crate::environment_files::read(app, site_id)?;
        if env.exists {
            fs::write(directory.join("project.env"), env.text)
                .map_err(|error| error.to_string())?;
        }
        let manifest = Manifest {
            site,
            environment,
            name: name.trim().chars().take(80).collect(),
            created_at: timestamp,
            has_env: env.exists,
            has_database: include_database,
        };
        fs::write(
            directory.join("manifest.json"),
            serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    })();
    if let Some(backup_id) = &temporary_backup_id {
        let _ = crate::backups::delete(app, &environment_id, backup_id);
    }
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&directory);
        return Err(error);
    }
    list(app, site_id)?
        .into_iter()
        .find(|snapshot| snapshot.id == id)
        .ok_or("Snapshot was not created".into())
}

pub fn create_safety_for_environment(
    app: &tauri::AppHandle,
    environment_id: &str,
    action: &str,
) -> Result<usize, String> {
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == environment_id)
        .ok_or("Environment not found")?;
    let running = crate::containers::environment_status(app, environment_id)?.status == "running";
    let server_database = !matches!(
        environment.database.to_ascii_lowercase().as_str(),
        "" | "none" | "sqlite"
    );
    let sites = crate::sites::list(app)?
        .into_iter()
        .filter(|site| site.environment_id == environment_id)
        .collect::<Vec<_>>();
    for site in &sites {
        create_inner(
            app,
            &site.id,
            &format!("Automatic pre-{action} snapshot"),
            running && server_database,
        )?;
        prune(app, &site.id, 20)?;
    }
    Ok(sites.len())
}
pub fn list(app: &tauri::AppHandle, site_id: &str) -> Result<Vec<Snapshot>, String> {
    let directory = root(app, site_id)?;
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut values = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let id = entry.file_name().to_str()?.to_owned();
            if !valid(&id) {
                return None;
            }
            let data = fs::read(entry.path().join("manifest.json")).ok()?;
            let manifest: Manifest = serde_json::from_slice(&data).ok()?;
            let size = if manifest.has_database {
                fs::metadata(entry.path().join("database.sql")).ok()?.len()
            } else {
                0
            };
            Some(Snapshot {
                id,
                site_id: site_id.into(),
                name: manifest.name,
                created_at: manifest.created_at,
                size,
                has_database: manifest.has_database,
            })
        })
        .collect::<Vec<_>>();
    values.sort_by_key(|snapshot| std::cmp::Reverse(snapshot.created_at));
    Ok(values)
}
pub fn restore(app: &tauri::AppHandle, site_id: &str, id: &str) -> Result<(), String> {
    if !valid(id) {
        return Err("Invalid snapshot identifier".into());
    }
    let directory = root(app, site_id)?.join(id);
    let manifest = load_manifest(&directory)?;
    if manifest.site.id != site_id {
        return Err("Snapshot belongs to another project".into());
    }
    let safety = create(app, site_id, "Automatic pre-restore snapshot")?;
    let safety_directory = root(app, site_id)?.join(&safety.id);
    let safety_manifest = load_manifest(&safety_directory)?;
    run_with_rollback(
        || apply(app, site_id, &directory, &manifest),
        || apply(app, site_id, &safety_directory, &safety_manifest),
    )
}

pub fn compare(
    app: &tauri::AppHandle,
    site_id: &str,
    id: &str,
) -> Result<SnapshotComparison, String> {
    if !valid(id) {
        return Err("Invalid snapshot identifier".into());
    }
    let directory = root(app, site_id)?.join(id);
    let manifest = load_manifest(&directory)?;
    if manifest.site.id != site_id {
        return Err("Snapshot belongs to another project".into());
    }
    let current_site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let current_environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == current_site.environment_id)
        .ok_or("Environment not found")?;
    let mut configuration_changes = changed_json_fields(
        "site",
        &serde_json::to_value(&manifest.site).map_err(|error| error.to_string())?,
        &serde_json::to_value(&current_site).map_err(|error| error.to_string())?,
    );
    configuration_changes.extend(changed_json_fields(
        "environment",
        &serde_json::to_value(&manifest.environment).map_err(|error| error.to_string())?,
        &serde_json::to_value(&current_environment).map_err(|error| error.to_string())?,
    ));
    let snapshot_env = if manifest.has_env {
        parse_env_keys(
            &fs::read_to_string(directory.join("project.env"))
                .map_err(|error| format!("Failed to read snapshot .env: {error}"))?,
        )
    } else {
        BTreeMap::new()
    };
    let current = crate::environment_files::read(app, site_id)?;
    let current_env = parse_env_keys(&current.text);
    let snapshot_keys = snapshot_env.keys().cloned().collect::<BTreeSet<_>>();
    let current_keys = current_env.keys().cloned().collect::<BTreeSet<_>>();
    let env_added = current_keys.difference(&snapshot_keys).cloned().collect();
    let env_removed = snapshot_keys.difference(&current_keys).cloned().collect();
    let env_changed = snapshot_keys
        .intersection(&current_keys)
        .filter(|key| snapshot_env.get(*key) != current_env.get(*key))
        .cloned()
        .collect();
    Ok(SnapshotComparison {
        configuration_changes,
        env_added,
        env_removed,
        env_changed,
        snapshot_database_size: if manifest.has_database {
            fs::metadata(directory.join("database.sql"))
                .map_err(|error| error.to_string())?
                .len()
        } else {
            0
        },
    })
}

fn changed_json_fields(prefix: &str, before: &Value, current: &Value) -> Vec<String> {
    let before = before.as_object();
    let current = current.as_object();
    let keys = before
        .into_iter()
        .flat_map(|value| value.keys())
        .chain(current.into_iter().flat_map(|value| value.keys()))
        .collect::<BTreeSet<_>>();
    keys.into_iter()
        .filter(|key| {
            before.and_then(|value| value.get(*key)) != current.and_then(|value| value.get(*key))
        })
        .map(|key| format!("{prefix}.{key}"))
        .collect()
}

fn parse_env_keys(text: &str) -> BTreeMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line
                .strip_prefix("export ")
                .unwrap_or(line)
                .split_once('=')?;
            let key = key.trim();
            if key.is_empty() {
                None
            } else {
                Some((key.to_owned(), value.trim().to_owned()))
            }
        })
        .collect()
}

fn load_manifest(directory: &std::path::Path) -> Result<Manifest, String> {
    serde_json::from_slice(
        &fs::read(directory.join("manifest.json")).map_err(|_| "Snapshot manifest is missing")?,
    )
    .map_err(|error| error.to_string())
}

fn apply(
    app: &tauri::AppHandle,
    site_id: &str,
    directory: &std::path::Path,
    manifest: &Manifest,
) -> Result<(), String> {
    crate::operations::progress_for_environment(
        app,
        &manifest.environment.id,
        40,
        "Restoring environment configuration",
    )?;
    crate::containers::save(app, manifest.environment.clone())?;
    if manifest.has_env {
        crate::environment_files::write(
            app,
            site_id,
            &fs::read_to_string(directory.join("project.env"))
                .map_err(|error| error.to_string())?,
        )?;
    } else {
        crate::environment_files::remove(app, site_id)?;
    }
    crate::containers::operate(app, &manifest.environment.id, "rebuild")?;
    if manifest.has_database {
        crate::operations::progress_for_environment(
            app,
            &manifest.environment.id,
            85,
            "Restoring snapshot database",
        )?;
        crate::backups::restore_file(
            app,
            &manifest.environment.id,
            &directory.join("database.sql"),
        )?;
    }
    Ok(())
}

fn run_with_rollback<T>(
    apply: impl FnOnce() -> Result<T, String>,
    rollback: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    match apply() {
        Ok(value) => Ok(value),
        Err(original) => match rollback() {
            Ok(_) => Err(format!(
                "Snapshot restore failed and the previous state was restored: {original}"
            )),
            Err(rollback_error) => Err(format!(
                "Snapshot restore failed: {original}. Automatic rollback also failed: {rollback_error}"
            )),
        },
    }
}
pub fn delete(app: &tauri::AppHandle, site_id: &str, id: &str) -> Result<(), String> {
    if !valid(id) {
        return Err("Invalid snapshot identifier".into());
    }
    let path = root(app, site_id)?.join(id);
    if !path.is_dir() {
        return Err("Snapshot not found".into());
    }
    fs::remove_dir_all(path).map_err(|error| error.to_string())
}

pub fn prune(app: &tauri::AppHandle, site_id: &str, keep: usize) -> Result<usize, String> {
    if !(1..=100).contains(&keep) {
        return Err("Keep count must be between 1 and 100".into());
    }
    let snapshots = list(app, site_id)?;
    let obsolete = obsolete_snapshots(snapshots, keep);
    for snapshot in &obsolete {
        delete(app, site_id, &snapshot.id)?;
    }
    Ok(obsolete.len())
}

fn obsolete_snapshots(snapshots: Vec<Snapshot>, keep: usize) -> Vec<Snapshot> {
    snapshots.into_iter().skip(keep).collect()
}

pub fn export(
    app: &tauri::AppHandle,
    site_id: &str,
    id: &str,
    destination: &std::path::Path,
) -> Result<PathBuf, String> {
    if !valid(id) {
        return Err("Invalid snapshot identifier".into());
    }
    if !destination.is_dir() {
        return Err("Select an existing export directory".into());
    }
    let source = root(app, site_id)?.join(id);
    let manifest = load_manifest(&source)?;
    if manifest.site.id != site_id {
        return Err("Snapshot belongs to another project".into());
    }
    let project = safe_filename(&manifest.site.name);
    let target = destination.join(format!("{project}-{id}.lspanel-snapshot"));
    if target.exists() {
        return Err("A snapshot export with this name already exists".into());
    }
    copy_snapshot_files(&source, &target)?;
    Ok(target)
}

pub fn import(
    app: &tauri::AppHandle,
    site_id: &str,
    source: &std::path::Path,
) -> Result<Snapshot, String> {
    if !source.is_dir() {
        return Err("Select an exported .lspanel-snapshot directory".into());
    }
    let mut manifest = load_manifest(source)?;
    if manifest.site.id != site_id {
        return Err("This snapshot was exported from another project".into());
    }
    if manifest.has_database && !source.join("database.sql").is_file() {
        return Err("Snapshot database dump is missing".into());
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let id = format!("snapshot-{timestamp}");
    let target = root(app, site_id)?.join(&id);
    copy_snapshot_files(source, &target)?;
    manifest.created_at = timestamp;
    if !manifest.name.ends_with(" (imported)") {
        manifest.name.push_str(" (imported)");
    }
    fs::write(
        target.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    list(app, site_id)?
        .into_iter()
        .find(|snapshot| snapshot.id == id)
        .ok_or("Imported snapshot was not created".into())
}

fn copy_snapshot_files(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
    fs::create_dir(target)
        .map_err(|error| format!("Failed to create snapshot directory: {error}"))?;
    let result = (|| {
        let file = "manifest.json";
        fs::copy(source.join(file), target.join(file))
            .map_err(|error| format!("Failed to copy {file}: {error}"))?;
        if source.join("database.sql").is_file() {
            fs::copy(source.join("database.sql"), target.join("database.sql"))
                .map_err(|error| format!("Failed to copy database.sql: {error}"))?;
        }
        if source.join("project.env").is_file() {
            fs::copy(source.join("project.env"), target.join("project.env"))
                .map_err(|error| format!("Failed to copy project.env: {error}"))?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(target);
    }
    result
}

fn safe_filename(value: &str) -> String {
    let value = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let value = value.trim_matches('-');
    if value.is_empty() {
        "project".into()
    } else {
        value.chars().take(64).collect()
    }
}

pub fn delete_all(app: &tauri::AppHandle, site_id: &str) -> Result<(), String> {
    let directory = root(app, site_id)?;
    if directory.exists() {
        fs::remove_dir_all(directory).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        obsolete_snapshots, run_with_rollback, safe_filename, safe_resource_id, valid, Snapshot,
    };
    use std::cell::Cell;

    #[test]
    fn snapshot_ids_reject_path_traversal() {
        assert!(valid("snapshot-123"));
        assert!(!valid("snapshot-../secret"));
        assert!(!valid("snapshot-123/file"));
        assert!(!valid("other-123"));
        assert!(safe_resource_id("site-123"));
        assert!(!safe_resource_id("../../site"));
        assert!(!safe_resource_id(".."));
    }

    #[test]
    fn failed_restore_runs_rollback_and_reports_success() {
        let rolled_back = Cell::new(false);
        let error = run_with_rollback(
            || Err::<(), _>("database unavailable".into()),
            || {
                rolled_back.set(true);
                Ok(())
            },
        )
        .unwrap_err();
        assert!(rolled_back.get());
        assert!(error.contains("previous state was restored"));
    }

    #[test]
    fn rollback_failure_preserves_both_errors() {
        let error = run_with_rollback(
            || Err::<(), _>("restore error".into()),
            || Err("rollback error".into()),
        )
        .unwrap_err();
        assert!(error.contains("restore error"));
        assert!(error.contains("rollback error"));
    }

    #[test]
    fn export_directory_names_cannot_escape_the_destination() {
        assert_eq!(safe_filename("../../My Project"), "My-Project");
        assert_eq!(safe_filename(""), "project");
    }

    #[test]
    fn retention_keeps_the_newest_snapshots() {
        let snapshots = (1..=4)
            .rev()
            .map(|created_at| Snapshot {
                id: format!("snapshot-{created_at}"),
                site_id: "site".into(),
                name: String::new(),
                created_at,
                size: 0,
                has_database: false,
            })
            .collect();
        let obsolete = obsolete_snapshots(snapshots, 2);
        assert_eq!(
            obsolete
                .into_iter()
                .map(|snapshot| snapshot.id)
                .collect::<Vec<_>>(),
            ["snapshot-2", "snapshot-1"]
        );
    }
}
