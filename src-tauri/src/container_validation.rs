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
        return Err("Environment name is required".into());
    }
    if !environment
        .name
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Name may contain only Latin letters, digits, - and _".into());
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
        .map_err(|_| "Port must be a number from 1 to 65535")?;
    if port == 0 {
        return Err("Port must be a number from 1 to 65535".into());
    }
    for value in [
        &environment.web_version,
        &environment.php_version,
        &environment.database_version,
        &environment.node_version,
        &environment.redis_version,
        &environment.elasticsearch_version,
        &environment.minio_version,
        &environment.rabbitmq_version,
    ] {
        if value.is_empty()
            || !value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')
            })
        {
            return Err("Invalid image version".into());
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
    const SERVICES: &[&str] = &[
        "redis",
        "node",
        "mailpit",
        "adminer",
        "phpmyadmin",
        "elasticsearch",
        "minio",
        "rabbitmq",
    ];
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

pub(crate) fn validate(environment: &Environment) -> Result<(), String> {
    validate_identity_and_platform(environment)?;
    validate_services_and_database(environment)?;
    for (label, value) in [
        ("PHP memory limit", &environment.php_memory_limit),
        ("PHP upload limit", &environment.php_upload_limit),
        ("PHP post limit", &environment.php_post_limit),
    ] {
        if value.is_empty()
            || !value
                .chars()
                .all(|character| character.is_ascii_digit() || matches!(character, 'K' | 'M' | 'G'))
        {
            return Err(format!("{label} must use a value such as 256M"));
        }
    }
    if environment.php_execution_time == 0 || environment.php_execution_time > 3600 {
        return Err("PHP execution time must be between 1 and 3600 seconds".into());
    }
    if environment.php_jit {
        if !environment
            .php_extensions
            .iter()
            .any(|extension| extension == "opcache")
        {
            return Err("PHP JIT requires the OPcache extension".into());
        }
        if !matches!(environment.php_jit_mode.as_str(), "tracing" | "function") {
            return Err("PHP JIT mode must be tracing or function".into());
        }
        if environment.php_jit_buffer_size.is_empty()
            || !environment
                .php_jit_buffer_size
                .chars()
                .all(|character| character.is_ascii_digit() || matches!(character, 'K' | 'M' | 'G'))
        {
            return Err("PHP JIT buffer size must use a value such as 64M".into());
        }
    }
    if environment.php_cron {
        let schedule_parts = environment.php_cron_schedule.split_whitespace().count();
        if schedule_parts != 5
            || environment.php_cron_schedule.contains(['\n', '\r'])
            || environment.php_cron_command.trim().is_empty()
            || environment.php_cron_command.contains(['\n', '\r'])
        {
            return Err("PHP cron requires a five-field schedule and a single-line command".into());
        }
    }
    if environment.backup_schedule_enabled {
        if !matches!(
            environment.backup_schedule_interval_hours,
            1 | 6 | 12 | 24 | 168
        ) {
            return Err("Backup schedule interval must be 1, 6, 12, 24 or 168 hours".into());
        }
        if environment.backup_retention_count == 0 || environment.backup_retention_count > 100 {
            return Err("Backup retention count must be between 1 and 100".into());
        }
    }
    if !matches!(
        environment.php_fpm_process_manager.as_str(),
        "dynamic" | "ondemand" | "static"
    ) {
        return Err("PHP-FPM process manager must be dynamic, ondemand or static".into());
    }
    if environment.php_fpm_max_children == 0 || environment.php_fpm_max_children > 1000 {
        return Err("PHP-FPM max children must be between 1 and 1000".into());
    }
    if environment.php_fpm_max_requests > 100_000 {
        return Err("PHP-FPM max requests cannot exceed 100000".into());
    }
    if environment.php_fpm_process_manager == "dynamic"
        && (environment.php_fpm_start_servers == 0
            || environment.php_fpm_min_spare_servers == 0
            || environment.php_fpm_max_spare_servers < environment.php_fpm_min_spare_servers
            || environment.php_fpm_start_servers > environment.php_fpm_max_children
            || environment.php_fpm_max_spare_servers > environment.php_fpm_max_children)
    {
        return Err(
            "Dynamic PHP-FPM server counts must be non-zero, ordered and not exceed max children"
                .into(),
        );
    }
    if environment.php_xdebug {
        if !matches!(
            environment.php_xdebug_mode.as_str(),
            "debug" | "develop,debug" | "debug,coverage"
        ) {
            return Err("Unsupported Xdebug mode".into());
        }
        if environment.php_xdebug_port == 0 {
            return Err("Xdebug port must be between 1 and 65535".into());
        }
        if !matches!(
            environment.php_xdebug_start.as_str(),
            "trigger" | "yes" | "no"
        ) {
            return Err("Xdebug start mode must be trigger, yes or no".into());
        }
        if environment.php_xdebug_ide_key.is_empty()
            || !environment.php_xdebug_ide_key.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err("Xdebug IDE key may contain only letters, digits, - and _".into());
        }
    }
    for (key, value) in &environment.environment_variables {
        if key.is_empty()
            || !key.chars().all(|character| {
                character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
            })
            || key
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_digit())
        {
            return Err("Environment variable names must use A-Z, 0-9 and underscores and cannot start with a digit".into());
        }
        if value.contains('\n') || value.contains('\r') {
            return Err(format!(
                "Environment variable {key} cannot contain line breaks"
            ));
        }
    }
    if !environment.redis_password.is_empty()
        && !environment
            .redis_password
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Redis password may contain only letters, digits, - and _".into());
    }
    if environment.redis_memory_limit.is_empty()
        || !environment.redis_memory_limit.chars().all(|character| {
            character.is_ascii_digit() || matches!(character, 'k' | 'm' | 'g' | 'b')
        })
    {
        return Err("Redis memory limit must use a value such as 256mb".into());
    }
    if !matches!(
        environment.redis_eviction_policy.as_str(),
        "noeviction"
            | "allkeys-lru"
            | "allkeys-lfu"
            | "allkeys-random"
            | "volatile-lru"
            | "volatile-lfu"
            | "volatile-ttl"
            | "volatile-random"
    ) {
        return Err("Unsupported Redis eviction policy".into());
    }
    if environment.elasticsearch_memory_limit.is_empty()
        || !environment
            .elasticsearch_memory_limit
            .chars()
            .all(|character| character.is_ascii_digit() || matches!(character, 'k' | 'm' | 'g'))
    {
        return Err("Elasticsearch memory limit must use a value such as 512m".into());
    }
    for (label, value) in [
        ("MinIO root user", &environment.minio_root_user),
        ("RabbitMQ user", &environment.rabbitmq_user),
    ] {
        if value.is_empty()
            || !value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err(format!("{label} may contain only letters, digits, - and _"));
        }
    }
    // MinIO refuses to start unless MINIO_ROOT_PASSWORD is at least 8 characters.
    if environment.minio_root_password.chars().count() < 8
        || !environment
            .minio_root_password
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(
            "MinIO root password must be at least 8 characters and contain only letters, digits, - and _"
                .into(),
        );
    }
    if environment.rabbitmq_password.is_empty()
        || !environment
            .rabbitmq_password
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("RabbitMQ password may contain only letters, digits, - and _".into());
    }
    if !matches!(
        environment.node_package_manager.as_str(),
        "npm" | "pnpm" | "yarn"
    ) {
        return Err("Unsupported Node.js package manager".into());
    }
    if environment.node_command.contains('\n') || environment.node_command.contains('\r') {
        return Err("Node.js command cannot contain line breaks".into());
    }
    if !matches!(environment.node_run_mode.as_str(), "dev" | "start") {
        return Err("Node.js run mode must be dev or start".into());
    }
    for command in [
        &environment.node_dev_command,
        &environment.node_build_command,
        &environment.node_start_command,
    ] {
        if command.contains(['\n', '\r']) || command.len() > 2048 {
            return Err("Node.js commands must be single-line and at most 2048 characters".into());
        }
    }
    if environment.node_inspector && environment.node_inspector_port == 0 {
        return Err("Node Inspector port must be between 1 and 65535".into());
    }
    if !matches!(environment.composer_version.as_str(), "2" | "2.8" | "2.7") {
        return Err("Unsupported Composer version".into());
    }
    if !matches!(
        environment.restart_policy.as_str(),
        "no" | "always" | "unless-stopped" | "on-failure"
    ) {
        return Err("Unsupported restart policy".into());
    }
    if environment
        .cpu_limit
        .parse::<f32>()
        .ok()
        .filter(|value| *value > 0.0 && *value <= 64.0)
        .is_none()
    {
        return Err("CPU limit must be between 0.1 and 64".into());
    }
    if environment.container_memory_limit.is_empty()
        || !environment
            .container_memory_limit
            .chars()
            .all(|character| character.is_ascii_digit() || matches!(character, 'm' | 'g'))
    {
        return Err("Container memory limit must use a value such as 2g or 512m".into());
    }
    if !environment.wordpress_admin_password.is_empty()
        && (environment.wordpress_admin_password.chars().count() < 8
            || environment
                .wordpress_admin_password
                .contains(['\n', '\r', '\0']))
    {
        return Err("WordPress administrator password must contain at least 8 characters and no line breaks".into());
    }
    if !environment.wordpress_admin_user.is_empty()
        && !environment
            .wordpress_admin_user
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(
            "WordPress administrator name may contain only letters, digits, - and _".into(),
        );
    }
    if !environment.wordpress_admin_email.is_empty()
        && (!environment.wordpress_admin_email.contains('@')
            || environment
                .wordpress_admin_email
                .contains(['\n', '\r', '\0']))
    {
        return Err("Enter a valid WordPress administrator email".into());
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
