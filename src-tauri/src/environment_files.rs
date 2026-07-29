use serde::Serialize;
use std::{fs, io::Read, path::PathBuf};

const MAX_ENV_SIZE: u64 = 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentFile {
    pub path: String,
    pub exists: bool,
    pub text: String,
    pub entries: Vec<EnvironmentEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentEntry {
    pub key: String,
    pub value: String,
    pub secret: bool,
}

pub fn read(app: &tauri::AppHandle, site_id: &str) -> Result<EnvironmentFile, String> {
    let path = env_path(app, site_id)?;
    if !path.exists() {
        return Ok(EnvironmentFile {
            path: path.display().to_string(),
            exists: false,
            text: String::new(),
            entries: Vec::new(),
        });
    }
    reject_symlink(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_ENV_SIZE {
        return Err(".env is larger than the 1 MiB safety limit".into());
    }
    let text =
        fs::read_to_string(&path).map_err(|error| format!("Failed to read .env: {error}"))?;
    let entries = parse(&text)?;
    Ok(EnvironmentFile {
        path: path.display().to_string(),
        exists: true,
        text,
        entries,
    })
}

pub fn read_example(app: &tauri::AppHandle, site_id: &str) -> Result<EnvironmentFile, String> {
    let path = env_path(app, site_id)?.with_file_name(".env.example");
    if !path.exists() {
        return Ok(EnvironmentFile {
            path: path.display().to_string(),
            exists: false,
            text: String::new(),
            entries: Vec::new(),
        });
    }
    reject_symlink(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_ENV_SIZE {
        return Err(".env.example is larger than the 1 MiB safety limit".into());
    }
    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read .env.example: {error}"))?;
    let entries = parse(&text)?;
    Ok(EnvironmentFile {
        path: path.display().to_string(),
        exists: true,
        text,
        entries,
    })
}

pub fn write(app: &tauri::AppHandle, site_id: &str, text: &str) -> Result<EnvironmentFile, String> {
    if text.len() as u64 > MAX_ENV_SIZE {
        return Err(".env is larger than the 1 MiB safety limit".into());
    }
    parse(text)?;
    let path = env_path(app, site_id)?;
    if path.exists() {
        reject_symlink(&path)?;
    }
    let temporary = path.with_extension(format!("env.tmp-{}", std::process::id()));
    fs::write(&temporary, text.as_bytes())
        .map_err(|error| format!("Failed to write temporary .env: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to replace .env: {error}")
    })?;
    read(app, site_id)
}

pub fn remove(app: &tauri::AppHandle, site_id: &str) -> Result<(), String> {
    let path = env_path(app, site_id)?;
    if !path.exists() {
        return Ok(());
    }
    reject_symlink(&path)?;
    fs::remove_file(path).map_err(|error| format!("Failed to remove .env: {error}"))
}

pub fn import_file(
    app: &tauri::AppHandle,
    site_id: &str,
    source: &std::path::Path,
) -> Result<EnvironmentFile, String> {
    let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("Environment import must be a regular file, not a symbolic link".into());
    }
    if metadata.len() > MAX_ENV_SIZE {
        return Err("Environment import is larger than the 1 MiB safety limit".into());
    }
    let text = fs::read_to_string(source)
        .map_err(|error| format!("Failed to read environment import: {error}"))?;
    write(app, site_id, &text)
}

pub fn export_file(
    app: &tauri::AppHandle,
    site_id: &str,
    destination: &std::path::Path,
) -> Result<(), String> {
    if destination
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err("Environment export cannot overwrite a symbolic link".into());
    }
    let parent = destination
        .parent()
        .ok_or("Invalid environment export path")?;
    if !parent.is_dir() {
        return Err("Environment export directory does not exist".into());
    }
    let source = read(app, site_id)?;
    if !source.exists {
        return Err("Project .env does not exist".into());
    }
    let temporary = parent.join(format!(".lspanel-env-export-{}.tmp", std::process::id()));
    let _ = fs::remove_file(&temporary);
    fs::write(&temporary, source.text.as_bytes()).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to write environment export: {error}")
    })?;
    if destination.is_file() {
        fs::remove_file(destination).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            format!("Failed to replace environment export: {error}")
        })?;
    }
    fs::rename(&temporary, destination).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to finalize environment export: {error}")
    })
}

pub fn list_profiles(app: &tauri::AppHandle, site_id: &str) -> Result<Vec<String>, String> {
    let directory = env_path(app, site_id)?
        .parent()
        .ok_or("Invalid project directory")?
        .to_owned();
    let mut profiles = if directory.is_dir() {
        fs::read_dir(directory)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                name.strip_prefix(".env.lspanel.")
                    .filter(|profile| valid_profile_name(profile))
                    .map(str::to_owned)
            })
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    profiles.sort();
    profiles.dedup();
    Ok(profiles)
}

pub fn save_profile(
    app: &tauri::AppHandle,
    site_id: &str,
    profile: &str,
    text: &str,
) -> Result<(), String> {
    parse(text)?;
    if text.len() as u64 > MAX_ENV_SIZE {
        return Err("Environment profile is larger than the 1 MiB safety limit".into());
    }
    let path = profile_path(app, site_id, profile)?;
    atomic_write(&path, text.as_bytes(), "environment profile")
}

pub fn activate_profile(
    app: &tauri::AppHandle,
    site_id: &str,
    profile: &str,
) -> Result<EnvironmentFile, String> {
    let path = profile_path(app, site_id, profile)?;
    if !path.exists() {
        return Err("Environment profile does not exist".into());
    }
    reject_symlink(&path)?;
    let metadata = fs::metadata(&path).map_err(|_| "Environment profile does not exist")?;
    if metadata.len() > MAX_ENV_SIZE {
        return Err("Environment profile is larger than the 1 MiB safety limit".into());
    }
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read environment profile: {error}"))?;
    write(app, site_id, &text)
}

pub fn delete_profile(app: &tauri::AppHandle, site_id: &str, profile: &str) -> Result<(), String> {
    let path = profile_path(app, site_id, profile)?;
    if !path.exists() {
        return Ok(());
    }
    reject_symlink(&path)?;
    fs::remove_file(path).map_err(|error| format!("Failed to delete environment profile: {error}"))
}

fn profile_path(app: &tauri::AppHandle, site_id: &str, profile: &str) -> Result<PathBuf, String> {
    let profile = profile.trim().to_ascii_lowercase();
    if !valid_profile_name(&profile) {
        return Err("Profile name may contain lowercase letters, digits, - and _".into());
    }
    Ok(env_path(app, site_id)?.with_file_name(format!(".env.lspanel.{profile}")))
}

fn valid_profile_name(profile: &str) -> bool {
    !profile.is_empty()
        && profile.len() <= 48
        && profile.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '-' | '_')
        })
}

fn atomic_write(path: &std::path::Path, data: &[u8], label: &str) -> Result<(), String> {
    if path.exists() {
        reject_symlink(&path.to_path_buf())?;
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid {label} path"))?;
    let temporary = path.with_file_name(format!("{file_name}.tmp-{}", std::process::id()));
    fs::write(&temporary, data)
        .map_err(|error| format!("Failed to write temporary {label}: {error}"))?;
    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to replace {label}: {error}")
    })
}

pub fn generate_secret(length: usize) -> Result<String, String> {
    if !(16..=128).contains(&length) {
        return Err("Secret length must be between 16 and 128 characters".into());
    }
    let byte_count = length.div_ceil(2);
    let mut bytes = vec![0_u8; byte_count];
    fs::File::open("/dev/urandom")
        .and_then(|mut file| file.read_exact(&mut bytes))
        .map_err(|error| format!("Secure random generator is unavailable: {error}"))?;
    Ok(bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()[..length]
        .to_owned())
}

fn env_path(app: &tauri::AppHandle, site_id: &str) -> Result<PathBuf, String> {
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let settings = crate::settings::load(app)?.ok_or("Settings not found")?;
    let root = fs::canonicalize(&settings.sites_directory)
        .map_err(|error| format!("Invalid sites directory: {error}"))?;
    let directory = fs::canonicalize(&site.directory)
        .map_err(|error| format!("Invalid site directory: {error}"))?;
    if !directory.starts_with(&root) {
        return Err("The site directory is outside the configured sites directory".into());
    }
    Ok(directory.join(".env"))
}

fn reject_symlink(path: &PathBuf) -> Result<(), String> {
    if fs::symlink_metadata(path)
        .map_err(|error| error.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Refusing to read or replace a symbolic .env link".into());
    }
    Ok(())
}

fn parse(text: &str) -> Result<Vec<EnvironmentEntry>, String> {
    let mut entries = Vec::new();
    let mut keys = std::collections::HashSet::new();
    for (index, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((key, value)) = line.split_once('=') else {
            return Err(format!(
                "Invalid .env line {}: expected KEY=value",
                index + 1
            ));
        };
        let key = key.trim();
        if key.is_empty()
            || !key.chars().enumerate().all(|(index, character)| {
                character == '_'
                    || character.is_ascii_alphanumeric()
                        && (index > 0 || !character.is_ascii_digit())
            })
        {
            return Err(format!("Invalid variable name on line {}", index + 1));
        }
        if !keys.insert(key.to_owned()) {
            return Err(format!("Duplicate variable {key} on line {}", index + 1));
        }
        let value = value
            .trim()
            .trim_matches(|character| character == '\'' || character == '"')
            .to_owned();
        entries.push(EnvironmentEntry {
            key: key.into(),
            secret: secret_key(key),
            value,
        });
    }
    Ok(entries)
}

pub(crate) fn secret_key(key: &str) -> bool {
    let key = key.to_ascii_uppercase();
    [
        "PASSWORD",
        "SECRET",
        "TOKEN",
        "API_KEY",
        "PRIVATE_KEY",
        "CREDENTIAL",
        "DATABASE_URL",
        "REDIS_URL",
        "AUTH",
        "DSN",
    ]
    .iter()
    .any(|marker| key.contains(marker))
        || key.ends_with("_KEY")
}

#[cfg(test)]
mod tests {
    use super::{parse, valid_profile_name};
    #[test]
    fn parses_and_classifies_environment_values() {
        let values =
            parse("APP_ENV=local\nDB_PASSWORD=secret\nAPP_KEY=base64:key\n# comment\n").unwrap();
        assert_eq!(values.len(), 3);
        assert!(!values[0].secret);
        assert!(values[1].secret);
        assert!(values[2].secret);
    }
    #[test]
    fn rejects_duplicates_and_invalid_keys() {
        assert!(parse("A=1\nA=2").is_err());
        assert!(parse("1KEY=value").is_err());
    }
    #[test]
    fn validates_safe_profile_names() {
        assert!(valid_profile_name("local"));
        assert!(valid_profile_name("testing_2"));
        assert!(valid_profile_name("client-a"));
        assert!(!valid_profile_name(""));
        assert!(!valid_profile_name("../production"));
        assert!(!valid_profile_name("Production"));
        assert!(!valid_profile_name("team/profile"));
    }
}
