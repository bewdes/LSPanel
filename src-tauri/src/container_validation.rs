use crate::containers::Environment;

pub(crate) fn safe_resource_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

pub(crate) fn validate_identity_and_platform(environment: &Environment) -> Result<(), String> {
    if !safe_resource_id(&environment.id) {
        return Err(
            "Environment identifier may contain only letters, digits, - and _ and must not exceed 128 characters"
                .into(),
        );
    }
    if environment.name.trim().is_empty() {
        return Err("Название окружения обязательно".into());
    }
    if !environment
        .name
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Название может содержать только латиницу, цифры, - и _".into());
    }
    if !matches!(environment.web_server.as_str(), "Apache" | "Nginx") {
        return Err("Unsupported web server".into());
    }
    if !matches!(
        environment.database.as_str(),
        "MySQL" | "MariaDB" | "PostgreSQL"
    ) {
        return Err("Unsupported database server".into());
    }
    if !matches!(environment.runtime_mode.as_str(), "container" | "native") {
        return Err("Runtime mode must be container or native".into());
    }
    let port: u16 = environment
        .port
        .parse()
        .map_err(|_| "Порт должен быть числом от 1 до 65535")?;
    if port == 0 {
        return Err("Порт должен быть числом от 1 до 65535".into());
    }
    for value in [
        &environment.web_version,
        &environment.php_version,
        &environment.database_version,
        &environment.node_version,
        &environment.redis_version,
    ] {
        if value.is_empty()
            || !value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')
            })
        {
            return Err("Недопустимая версия образа".into());
        }
    }
    if !matches!(
        environment.php_version.as_str(),
        "8.1" | "8.2" | "8.3" | "8.4" | "8.5"
    ) {
        return Err("Unsupported PHP version; choose PHP 8.1 through 8.5".into());
    }
    Ok(())
}

pub(crate) fn validate_services_and_database(environment: &Environment) -> Result<(), String> {
    for value in [
        &environment.web_container_name,
        &environment.database_container_name,
    ] {
        if !value.is_empty()
            && (!value
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_alphanumeric())
                || !value.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
                }))
        {
            return Err("Container names must start with a letter or digit and contain only letters, digits, -, _ and .".into());
        }
    }
    const EXTENSIONS: &[&str] = &[
        "bcmath",
        "curl",
        "exif",
        "gd",
        "imagick",
        "intl",
        "mbstring",
        "mysqli",
        "opcache",
        "pdo_mysql",
        "pdo_pgsql",
        "redis",
        "sockets",
        "xdebug",
        "zip",
    ];
    const SERVICES: &[&str] = &["redis", "node", "mailpit", "adminer", "phpmyadmin"];
    if environment
        .php_extensions
        .iter()
        .any(|value| !EXTENSIONS.contains(&value.as_str()))
    {
        return Err("Unsupported PHP extension".into());
    }
    if environment
        .extra_services
        .iter()
        .any(|value| !SERVICES.contains(&value.as_str()))
    {
        return Err("Unsupported additional service".into());
    }
    if environment.database == "PostgreSQL"
        && environment
            .extra_services
            .iter()
            .any(|value| value == "phpmyadmin")
    {
        return Err(
            "phpMyAdmin supports MySQL and MariaDB only. Use Adminer with PostgreSQL.".into(),
        );
    }
    for (label, value) in [
        ("Database name", &environment.database_name),
        ("Database user", &environment.database_user),
    ] {
        if value.is_empty()
            || !value
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            return Err(format!(
                "{label} may contain only letters, digits and underscores"
            ));
        }
    }
    for (label, value) in [
        ("Database password", &environment.database_password),
        (
            "Database root password",
            &environment.database_root_password,
        ),
    ] {
        if value.is_empty()
            || !value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err(format!("{label} may contain only letters, digits, - and _"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::safe_resource_id;

    #[test]
    fn resource_ids_are_safe_for_paths_and_compose_names() {
        assert!(safe_resource_id("env-123"));
        assert!(!safe_resource_id("../../env"));
        assert!(!safe_resource_id(".."));
        assert!(!safe_resource_id("env name"));
        assert!(!safe_resource_id("env\nservices:"));
        assert!(!safe_resource_id(&"a".repeat(129)));
    }
}
