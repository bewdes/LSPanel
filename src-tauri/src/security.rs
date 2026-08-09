const REDACTED: &str = "••••••••";

pub fn write_private_file(path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    if path.exists()
        && std::fs::symlink_metadata(path)
            .map_err(|error| error.to_string())?
            .file_type()
            .is_symlink()
    {
        return Err("Refusing to replace a symbolic export link".into());
    }
    let parent = path.parent().ok_or("Export path has no parent directory")?;
    if !parent.is_dir() {
        return Err("Export directory does not exist".into());
    }
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = parent.join(format!(
        ".{}.lspanel-export-{}-{timestamp}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("export"),
        std::process::id()
    ));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options
            .open(&temporary)
            .map_err(|error| format!("Failed to create export file: {error}"))?;
        file.write_all(data)
            .map_err(|error| format!("Failed to write export file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Failed to finalize export file: {error}"))?;
        std::fs::rename(&temporary, path)
            .map_err(|error| format!("Failed to replace export file: {error}"))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}

pub fn redact(text: &str, secrets: impl IntoIterator<Item = String>) -> String {
    let mut result = redact_url_credentials(text);
    let mut secrets = secrets
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    secrets.sort_by_key(|value| std::cmp::Reverse(value.len()));
    secrets.dedup();
    for secret in secrets {
        result = result.replace(&secret, REDACTED);
    }
    result
}

pub fn environment_error(app: &tauri::AppHandle, environment_id: &str, error: &str) -> String {
    redact(error, environment_secrets(app, environment_id))
}

pub fn environment_secrets(app: &tauri::AppHandle, environment_id: &str) -> Vec<String> {
    let Some(environment) = crate::containers::list(app)
        .unwrap_or_default()
        .into_iter()
        .find(|environment| environment.id == environment_id)
    else {
        return Vec::new();
    };
    let mut secrets = configured_secrets(&environment);
    for site in crate::sites::list(app)
        .unwrap_or_default()
        .into_iter()
        .filter(|site| site.environment_id == environment_id)
    {
        if let Ok(file) = crate::environment_files::read(app, &site.id) {
            secrets.extend(
                file.entries
                    .into_iter()
                    .filter(|entry| entry.secret)
                    .map(|entry| entry.value),
            );
        }
    }
    secrets
}

pub fn configured_secrets(environment: &crate::containers::Environment) -> Vec<String> {
    let mut secrets = vec![
        environment.database_password.clone(),
        environment.database_root_password.clone(),
        environment.redis_password.clone(),
        environment.wordpress_admin_password.clone(),
        environment.minio_root_password.clone(),
        environment.rabbitmq_password.clone(),
    ];
    secrets.extend(
        environment
            .environment_variables
            .iter()
            .filter(|(key, _)| crate::environment_files::secret_key(key))
            .map(|(_, value)| value.clone()),
    );
    secrets
}

fn redact_url_credentials(text: &str) -> String {
    let mut result = text.to_owned();
    let mut offset = 0;
    while let Some(relative) = result[offset..].find("://") {
        let authority_start = offset + relative + 3;
        let authority_end = result[authority_start..]
            .find(|character: char| character == '/' || character.is_whitespace())
            .map(|index| authority_start + index)
            .unwrap_or(result.len());
        let Some(at) = result[authority_start..authority_end].rfind('@') else {
            offset = authority_end;
            continue;
        };
        let at = authority_start + at;
        result.replace_range(authority_start..at, REDACTED);
        offset = authority_start + REDACTED.len() + 1;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{redact, write_private_file};

    #[test]
    fn redacts_all_known_secrets_and_prefers_long_values() {
        let value = redact(
            "mysql -proot-secret failed; password=secret; redis-secret rejected",
            ["secret", "root-secret", "redis-secret"].map(str::to_owned),
        );
        assert_eq!(
            value,
            "mysql -p•••••••• failed; password=••••••••; •••••••• rejected"
        );
        assert_eq!(
            redact(
                "fatal: https://user:token@example.test/repo.git",
                Vec::new()
            ),
            "fatal: https://••••••••@example.test/repo.git"
        );
    }

    #[test]
    fn ignores_empty_values_but_redacts_short_ones() {
        assert_eq!(
            redact("service db failed", ["", "db"].map(str::to_owned)),
            "service •••••••• failed"
        );
    }

    #[test]
    fn exported_logs_are_written_as_private_files() {
        let path =
            std::env::temp_dir().join(format!("lspanel-private-export-{}", std::process::id()));
        let _ = std::fs::remove_file(&path);
        write_private_file(&path, b"safe logs").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"safe logs");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        std::fs::remove_file(path).unwrap();
    }
}
