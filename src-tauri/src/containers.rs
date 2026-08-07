use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    process::Stdio,
    thread,
    time::Duration,
};
use tauri::Manager;

use crate::container_inspection::{
    apply_stats as apply_service_stats, parse_services as parse_service_inspections,
};
pub use crate::container_inspection::{EnvironmentInspection, EnvironmentState, ServiceInspection};
use crate::container_lifecycle::{emit_progress, pull_images, run_compose};
pub use crate::container_logs::LogProcess;
use crate::container_routes::{
    https_proxy_block, live_link_proxy_block, local_http_status, service_hostname,
    status_is_available as route_status_is_available, stopped_site_block,
};
pub(crate) use crate::container_runtime::command as runtime_command;
pub use crate::container_runtime::{
    detect as detect_runtime, detect_each as detect_runtimes, RuntimeStatus,
};
use crate::container_validation::{
    safe_resource_id, validate_identity_and_platform, validate_services_and_database,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub web_server: String,
    pub web_version: String,
    pub php_version: String,
    pub database: String,
    pub database_version: String,
    pub port: String,
    #[serde(default)]
    pub web_container_name: String,
    #[serde(default)]
    pub database_container_name: String,
    #[serde(default)]
    pub php_extensions: Vec<String>,
    #[serde(default)]
    pub extra_services: Vec<String>,
    #[serde(default = "default_node_version")]
    pub node_version: String,
    #[serde(default = "default_redis_version")]
    pub redis_version: String,
    #[serde(default = "default_database_name")]
    pub database_name: String,
    #[serde(default = "default_database_user")]
    pub database_user: String,
    #[serde(default = "default_database_password")]
    pub database_password: String,
    #[serde(default = "default_database_root_password")]
    pub database_root_password: String,
    #[serde(default = "default_php_memory_limit")]
    pub php_memory_limit: String,
    #[serde(default = "default_php_upload_limit")]
    pub php_upload_limit: String,
    #[serde(default = "default_php_post_limit")]
    pub php_post_limit: String,
    #[serde(default = "default_php_execution_time")]
    pub php_execution_time: u32,
    #[serde(default)]
    pub php_jit: bool,
    #[serde(default = "default_php_jit_mode")]
    pub php_jit_mode: String,
    #[serde(default = "default_php_jit_buffer_size")]
    pub php_jit_buffer_size: String,
    #[serde(default)]
    pub php_cron: bool,
    #[serde(default = "default_php_cron_schedule")]
    pub php_cron_schedule: String,
    #[serde(default = "default_php_cron_command")]
    pub php_cron_command: String,
    #[serde(default = "default_php_fpm_process_manager")]
    pub php_fpm_process_manager: String,
    #[serde(default = "default_php_fpm_max_children")]
    pub php_fpm_max_children: u32,
    #[serde(default = "default_php_fpm_start_servers")]
    pub php_fpm_start_servers: u32,
    #[serde(default = "default_php_fpm_min_spare_servers")]
    pub php_fpm_min_spare_servers: u32,
    #[serde(default = "default_php_fpm_max_spare_servers")]
    pub php_fpm_max_spare_servers: u32,
    #[serde(default = "default_php_fpm_max_requests")]
    pub php_fpm_max_requests: u32,
    #[serde(default)]
    pub php_xdebug: bool,
    #[serde(default = "default_php_xdebug_mode")]
    pub php_xdebug_mode: String,
    #[serde(default = "default_php_xdebug_port")]
    pub php_xdebug_port: u16,
    #[serde(default = "default_php_xdebug_start")]
    pub php_xdebug_start: String,
    #[serde(default = "default_php_xdebug_ide_key")]
    pub php_xdebug_ide_key: String,
    #[serde(default)]
    pub environment_variables: BTreeMap<String, String>,
    #[serde(default)]
    pub redis_password: String,
    #[serde(default = "default_redis_memory_limit")]
    pub redis_memory_limit: String,
    #[serde(default = "default_redis_eviction_policy")]
    pub redis_eviction_policy: String,
    #[serde(default = "default_elasticsearch_version")]
    pub elasticsearch_version: String,
    #[serde(default = "default_elasticsearch_memory_limit")]
    pub elasticsearch_memory_limit: String,
    #[serde(default = "default_minio_version")]
    pub minio_version: String,
    #[serde(default = "default_minio_root_user")]
    pub minio_root_user: String,
    #[serde(default = "default_minio_root_password")]
    pub minio_root_password: String,
    #[serde(default = "default_rabbitmq_version")]
    pub rabbitmq_version: String,
    #[serde(default = "default_rabbitmq_user")]
    pub rabbitmq_user: String,
    #[serde(default = "default_rabbitmq_password")]
    pub rabbitmq_password: String,
    #[serde(default = "default_node_package_manager")]
    pub node_package_manager: String,
    #[serde(default = "default_node_auto_install")]
    pub node_auto_install: bool,
    #[serde(default = "default_node_auto_restart")]
    pub node_auto_restart: bool,
    #[serde(default)]
    pub node_command: String,
    #[serde(default = "default_node_run_mode")]
    pub node_run_mode: String,
    #[serde(default)]
    pub node_dev_command: String,
    #[serde(default)]
    pub node_build_command: String,
    #[serde(default)]
    pub node_start_command: String,
    #[serde(default)]
    pub node_inspector: bool,
    #[serde(default = "default_node_inspector_port")]
    pub node_inspector_port: u16,
    #[serde(default = "default_runtime_mode")]
    pub runtime_mode: String,
    #[serde(default = "default_composer_version")]
    pub composer_version: String,
    #[serde(default = "default_restart_policy")]
    pub restart_policy: String,
    #[serde(default = "default_cpu_limit")]
    pub cpu_limit: String,
    #[serde(default = "default_container_memory_limit")]
    pub container_memory_limit: String,
    #[serde(default)]
    pub wordpress_site_title: String,
    #[serde(default)]
    pub wordpress_admin_user: String,
    #[serde(default)]
    pub wordpress_admin_password: String,
    #[serde(default)]
    pub wordpress_admin_email: String,
    #[serde(default)]
    pub backup_schedule_enabled: bool,
    #[serde(default = "default_backup_schedule_interval_hours")]
    pub backup_schedule_interval_hours: u32,
    #[serde(default = "default_backup_retention_count")]
    pub backup_retention_count: u32,
}

fn default_node_version() -> String {
    "22".into()
}
fn default_redis_version() -> String {
    "7.4".into()
}
fn default_database_name() -> String {
    "app".into()
}
fn default_database_user() -> String {
    "app".into()
}
fn default_database_password() -> String {
    "localdev".into()
}
fn default_database_root_password() -> String {
    "localdev".into()
}
fn default_php_memory_limit() -> String {
    "256M".into()
}
fn default_php_upload_limit() -> String {
    "64M".into()
}
fn default_php_post_limit() -> String {
    "64M".into()
}
fn default_php_execution_time() -> u32 {
    120
}
fn default_php_jit_mode() -> String {
    "tracing".into()
}
fn default_php_jit_buffer_size() -> String {
    "64M".into()
}
fn default_php_cron_schedule() -> String {
    "* * * * *".into()
}
fn default_php_cron_command() -> String {
    "php artisan schedule:run".into()
}
fn default_backup_schedule_interval_hours() -> u32 {
    24
}
fn default_backup_retention_count() -> u32 {
    7
}
fn default_php_fpm_process_manager() -> String {
    "dynamic".into()
}
fn default_php_fpm_max_children() -> u32 {
    10
}
fn default_php_fpm_start_servers() -> u32 {
    2
}
fn default_php_fpm_min_spare_servers() -> u32 {
    1
}
fn default_php_fpm_max_spare_servers() -> u32 {
    3
}
fn default_php_fpm_max_requests() -> u32 {
    500
}
fn default_php_xdebug_mode() -> String {
    "develop,debug".into()
}
fn default_php_xdebug_port() -> u16 {
    9003
}
fn default_php_xdebug_start() -> String {
    "trigger".into()
}
fn default_php_xdebug_ide_key() -> String {
    "LSPANEL".into()
}
fn default_redis_memory_limit() -> String {
    "256mb".into()
}
fn default_redis_eviction_policy() -> String {
    "allkeys-lru".into()
}
fn default_elasticsearch_version() -> String {
    "8.15.3".into()
}
fn default_elasticsearch_memory_limit() -> String {
    "512m".into()
}
fn default_minio_version() -> String {
    "RELEASE.2024-11-07T00-52-20Z".into()
}
fn default_minio_root_user() -> String {
    "minioadmin".into()
}
fn default_minio_root_password() -> String {
    "minioadmin123".into()
}
fn default_rabbitmq_version() -> String {
    "3.13".into()
}
fn default_rabbitmq_user() -> String {
    "guest".into()
}
fn default_rabbitmq_password() -> String {
    "guest".into()
}
fn default_node_package_manager() -> String {
    "npm".into()
}
fn default_node_auto_install() -> bool {
    true
}
fn default_node_auto_restart() -> bool {
    true
}
fn default_node_run_mode() -> String {
    "dev".into()
}
fn default_node_inspector_port() -> u16 {
    9229
}
fn default_runtime_mode() -> String {
    "container".into()
}
fn default_composer_version() -> String {
    "2".into()
}
fn default_restart_policy() -> String {
    "unless-stopped".into()
}
fn default_cpu_limit() -> String {
    "2.0".into()
}
fn default_container_memory_limit() -> String {
    "2g".into()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentOperation {
    pub id: String,
    pub status: String,
    pub output: String,
}

pub fn list(app: &tauri::AppHandle) -> Result<Vec<Environment>, String> {
    crate::storage::list_environments(app)?
        .into_iter()
        .map(|data| {
            serde_json::from_str(&data)
                .map_err(|error| format!("Invalid environment record: {error}"))
        })
        .collect()
}

pub fn save(app: &tauri::AppHandle, environment: Environment) -> Result<Vec<Environment>, String> {
    validate(&environment)?;
    if environment.runtime_mode != "native" {
        prepare(app, &environment)?;
    }
    let data = serde_json::to_string(&environment).map_err(|error| error.to_string())?;
    crate::storage::save_environment(app, &environment.id, &data)?;
    list(app)
}

pub fn delete(app: &tauri::AppHandle, id: &str) -> Result<Vec<Environment>, String> {
    if !safe_resource_id(id) {
        return Err("Invalid environment identifier".into());
    }
    let site_ids = crate::sites::list(app)?
        .into_iter()
        .filter(|site| site.environment_id == id)
        .map(|site| site.id)
        .collect::<Vec<_>>();
    crate::storage::delete_environment(app, id)?;
    let mut cleanup_errors = Vec::new();
    let stack = stack_directory(app, id)?;
    if stack.exists() {
        if let Err(error) = fs::remove_dir_all(stack) {
            cleanup_errors.push(format!("generated stack: {error}"));
        }
    }
    if let Err(error) = crate::backups::delete_all(app, id) {
        cleanup_errors.push(format!("database backups: {error}"));
    }
    for site_id in site_ids {
        if let Err(error) = crate::snapshots::delete_all(app, &site_id) {
            cleanup_errors.push(format!("snapshots for {site_id}: {error}"));
        }
    }
    if !cleanup_errors.is_empty() {
        return Err(format!(
            "Environment record was deleted, but some generated data could not be removed: {}",
            cleanup_errors.join("; ")
        ));
    }
    list(app)
}

fn validate(environment: &Environment) -> Result<(), String> {
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

pub fn operate(
    app: &tauri::AppHandle,
    id: &str,
    action: &str,
) -> Result<EnvironmentOperation, String> {
    operate_inner(app, id, action, true)
}

pub(crate) fn operate_for_provisioning(
    app: &tauri::AppHandle,
    id: &str,
    action: &str,
) -> Result<EnvironmentOperation, String> {
    operate_inner(app, id, action, false)
}

fn operate_inner(
    app: &tauri::AppHandle,
    id: &str,
    action: &str,
    verify_routes: bool,
) -> Result<EnvironmentOperation, String> {
    if action != "rebuild-no-cache" && crate::container_lifecycle::action_args(action).is_none() {
        return Err("Unsupported action".into());
    }
    emit_progress(app, id, 5, "Validating environment");
    let environment = list(app)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or("Окружение не найдено")?;
    validate(&environment)?;
    if environment.runtime_mode == "native" {
        return crate::native_runtime::operate(app, &environment, action);
    }
    emit_progress(app, id, 15, "Preparing project directories");
    crate::sites::ensure_directories(app, id)?;
    let preferred = crate::settings::load(app)?.map(|value| value.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or(runtime.message)?;
    emit_progress(app, id, 25, "Generating Compose configuration");
    let directory = prepare(app, &environment)?;
    if matches!(
        action,
        "start" | "restart" | "rebuild" | "rebuild-no-cache" | "unpause"
    ) {
        emit_progress(app, id, 35, "Preparing container network");
        ensure_network(&executable)?;
    }
    if matches!(action, "start" | "rebuild" | "rebuild-no-cache") {
        emit_progress(app, id, 45, "Downloading container images");
        pull_images(app, id, &executable, &directory)?;
    }
    emit_progress(
        app,
        id,
        75,
        match action {
            "stop" => "Stopping services",
            "kill" => "Force stopping services",
            "pause" => "Pausing services",
            "unpause" => "Resuming services",
            "destroy" => "Removing services and volumes",
            "restart" => "Restarting services",
            "rebuild-no-cache" => "Rebuilding images without cache",
            _ => "Creating and starting services",
        },
    );
    let combined = if action == "rebuild-no-cache" {
        let build = run_compose(
            app,
            id,
            &executable,
            &directory,
            &["compose", "build", "--no-cache"],
        )?;
        let up = run_compose(
            app,
            id,
            &executable,
            &directory,
            &["compose", "up", "-d", "--force-recreate"],
        )?;
        format!("{build}\n{up}")
    } else {
        let args = crate::container_lifecycle::action_args(action)
            .expect("action was validated before side effects");
        run_compose(app, id, &executable, &directory, args)?
    };
    if matches!(
        action,
        "start" | "restart" | "rebuild" | "rebuild-no-cache" | "unpause"
    ) {
        emit_progress(app, id, 85, "Creating database and user");
        ensure_database(app, id, &executable, &directory, &environment)?;
        emit_progress(app, id, 90, "Configuring local gateway");
        ensure_gateway(app, &executable)?;
        if verify_routes {
            emit_progress(app, id, 95, "Checking local site routes");
            verify_environment_sites(app, id)?;
        }
        for site in crate::sites::list(app)?
            .into_iter()
            .filter(|site| site.environment_id == id)
        {
            crate::project_templates::repair_permissions(app, &site, &environment)?;
        }
        crate::sites::mark_environment_started(app, id)?;
    }
    emit_progress(app, id, 100, "Completed");
    Ok(EnvironmentOperation {
        id: id.into(),
        status: action.into(),
        output: combined,
    })
}

pub fn operate_service(
    app: &tauri::AppHandle,
    id: &str,
    service: &str,
    action: &str,
) -> Result<EnvironmentOperation, String> {
    const SERVICES: &[&str] = &[
        "web",
        "php",
        "database",
        "redis",
        "node",
        "mailpit",
        "adminer",
        "phpmyadmin",
        "cron",
    ];
    if !SERVICES.contains(&service) {
        return Err("Unsupported service".into());
    }
    if !matches!(action, "start" | "stop" | "restart") {
        return Err("Unsupported service action".into());
    }
    let environment = list(app)?
        .into_iter()
        .find(|environment| environment.id == id)
        .ok_or("Environment not found")?;
    let available = service == "web"
        || service == "database"
        || (service == "php" && environment.web_server == "Nginx")
        || (service == "cron" && environment.php_cron)
        || environment
            .extra_services
            .iter()
            .any(|item| item == service);
    if !available {
        return Err(format!("Service {service} is not enabled"));
    }
    let settings = crate::settings::load(app)?.ok_or("Settings not found")?;
    let runtime = detect_runtime(Some(&settings.runtime));
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or(runtime.message)?;
    let directory = stack_directory(app, id)?;
    let args = ["compose", action, service];
    let output = run_compose(app, id, &executable, &directory, &args)?;
    Ok(EnvironmentOperation {
        id: id.into(),
        status: format!("{service}:{action}"),
        output: crate::security::environment_error(app, id, &output),
    })
}

fn service_context(
    app: &tauri::AppHandle,
    id: &str,
    service: &str,
) -> Result<(String, PathBuf), String> {
    const SERVICES: &[&str] = &[
        "web",
        "php",
        "database",
        "redis",
        "node",
        "mailpit",
        "adminer",
        "phpmyadmin",
        "cron",
    ];
    if !SERVICES.contains(&service) {
        return Err("Unsupported service".into());
    }
    let environment = list(app)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or("Environment not found")?;
    let available = service == "web"
        || service == "database"
        || (service == "php" && environment.web_server == "Nginx")
        || (service == "cron" && environment.php_cron)
        || environment
            .extra_services
            .iter()
            .any(|item| item == service);
    if !available {
        return Err(format!("Service {service} is not enabled"));
    }
    let settings = crate::settings::load(app)?.ok_or("Settings not found")?;
    let runtime = detect_runtime(Some(&settings.runtime));
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or(runtime.message)?;
    Ok((executable, stack_directory(app, id)?))
}

pub fn service_configuration(
    app: &tauri::AppHandle,
    id: &str,
    service: &str,
) -> Result<String, String> {
    let (executable, directory) = service_context(app, id, service)?;
    let output = crate::process::output(
        runtime_command(&executable)
            .args(["compose", "config", "--format", "json"])
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Compose configuration",
    )?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Invalid Compose configuration: {error}"))?;
    let service_value = value
        .get("services")
        .and_then(|services| services.get(service))
        .ok_or("Service is absent from the generated Compose configuration")?;
    serde_json::to_string_pretty(service_value)
        .map(|configuration| crate::security::environment_error(app, id, &configuration))
        .map_err(|error| error.to_string())
}

pub fn execute_service_command(
    app: &tauri::AppHandle,
    id: &str,
    service: &str,
    command: Vec<String>,
) -> Result<String, String> {
    if command.is_empty()
        || command.len() > 32
        || command
            .iter()
            .any(|argument| argument.len() > 512 || argument.contains('\0'))
    {
        return Err("Enter a valid command with at most 32 arguments".into());
    }
    let (executable, directory) = service_context(app, id, service)?;
    let mut arguments = vec![
        "compose".to_owned(),
        "exec".to_owned(),
        "-T".to_owned(),
        service.to_owned(),
    ];
    arguments.extend(command);
    let output = crate::process::output(
        runtime_command(&executable)
            .args(&arguments)
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::NETWORK_TIMEOUT,
        "container command",
    )?;
    let combined = crate::security::environment_error(
        app,
        id,
        &format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ),
    );
    if !output.status.success() {
        return Err(if combined.trim().is_empty() {
            format!("Command exited with {}", output.status)
        } else {
            combined
        });
    }
    Ok(if combined.trim().is_empty() {
        "Command completed without output".into()
    } else {
        combined
    })
}

fn compose_exec(
    executable: &str,
    directory: &Path,
    args: &[String],
) -> Result<std::process::Output, String> {
    crate::process::output(
        runtime_command(executable)
            .args(args)
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::DATABASE_TIMEOUT,
        "database container command",
    )
}

fn postgres_database_exists_query(database_name: &str) -> String {
    format!("SELECT 1 FROM pg_database WHERE datname = '{database_name}';")
}

/// Validated `DB_CHARSET` environment variable (set by the project wizard's
/// "Encoding" field), or MySQL/MariaDB's sane default. Shared with
/// `backups::clear_database_sql` so charset selection is consistent between
/// initial creation and a manual "clear database".
pub(crate) fn database_charset(environment: &Environment) -> &str {
    environment
        .environment_variables
        .get("DB_CHARSET")
        .filter(|value| {
            !value.is_empty()
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '_')
        })
        .map(String::as_str)
        .unwrap_or("utf8mb4")
}

fn ensure_database(
    app: &tauri::AppHandle,
    id: &str,
    executable: &str,
    directory: &Path,
    environment: &Environment,
) -> Result<(), String> {
    let mut ready = false;
    let mut last_error = String::new();
    // A fresh MySQL/MariaDB data directory can take considerably longer than
    // 30 seconds to initialise on slower disks or immediately after an image pull.
    for attempt in 0..60 {
        let args = if environment.database == "PostgreSQL" {
            vec![
                "compose".into(),
                "exec".into(),
                "-T".into(),
                "database".into(),
                "pg_isready".into(),
                "-U".into(),
                environment.database_user.clone(),
            ]
        } else {
            let admin = if environment.database == "MariaDB" {
                "mariadb-admin"
            } else {
                "mysqladmin"
            };
            vec![
                "compose".into(),
                "exec".into(),
                "-T".into(),
                "database".into(),
                admin.into(),
                "ping".into(),
                "-h".into(),
                "127.0.0.1".into(),
                "-uroot".into(),
                format!("-p{}", environment.database_root_password),
                "--silent".into(),
            ]
        };
        match compose_exec(executable, directory, &args) {
            Ok(output) if output.status.success() => {
                ready = true;
                break;
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
                last_error = if stderr.is_empty() { stdout } else { stderr };
            }
            Err(error) => last_error = error,
        }
        if attempt % 5 == 0 {
            emit_progress(
                app,
                id,
                85,
                &format!(
                    "Waiting for database initialization ({}s)",
                    (attempt + 1) * 2
                ),
            );
        }
        thread::sleep(Duration::from_secs(2));
    }
    if !ready {
        let log_args = vec![
            "compose".into(),
            "logs".into(),
            "--no-color".into(),
            "--tail".into(),
            "40".into(),
            "database".into(),
        ];
        let logs = compose_exec(executable, directory, &log_args)
            .ok()
            .map(|output| {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
                if stdout.is_empty() {
                    stderr
                } else {
                    stdout
                }
            })
            .unwrap_or_default();
        let detail = if !logs.is_empty() {
            logs
        } else if !last_error.is_empty() {
            last_error
        } else {
            "No database logs were returned".into()
        };
        return Err(format!(
            "Database service did not become ready within 120 seconds.\n{detail}"
        ));
    }
    // The project wizard's "Automatically create database" toggle is stored
    // as an environment variable rather than a dedicated field; honor it
    // here instead of always creating the database regardless of the user's
    // choice. The database *server* still needs to be up first (waited for
    // above) even when skipping creation, since an app installer or an
    // imported SQL dump may create its own database.
    if environment
        .environment_variables
        .get("LS_PANEL_AUTO_CREATE_DATABASE")
        .map(String::as_str)
        == Some("false")
    {
        return Ok(());
    }
    if environment.database == "PostgreSQL" {
        let query = postgres_database_exists_query(&environment.database_name);
        let query_args = vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "-e".into(),
            format!("PGPASSWORD={}", environment.database_password),
            "database".into(),
            "psql".into(),
            "-U".into(),
            environment.database_user.clone(),
            "-d".into(),
            "postgres".into(),
            "-tAc".into(),
            query,
        ];
        let query_output = compose_exec(executable, directory, &query_args)?;
        if !query_output.status.success() {
            return Err(String::from_utf8_lossy(&query_output.stderr)
                .trim()
                .to_owned());
        }
        if String::from_utf8_lossy(&query_output.stdout).trim() == "1" {
            return Ok(());
        }
        let create_args = vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "-e".into(),
            format!("PGPASSWORD={}", environment.database_password),
            "database".into(),
            "createdb".into(),
            "-U".into(),
            environment.database_user.clone(),
            environment.database_name.clone(),
        ];
        let output = compose_exec(executable, directory, &create_args)?;
        return if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
        };
    }

    let client = if environment.database == "MariaDB" {
        "mariadb"
    } else {
        "mysql"
    };
    let charset = database_charset(environment);
    let sql = format!("CREATE DATABASE IF NOT EXISTS `{}` CHARACTER SET {charset}; CREATE USER IF NOT EXISTS '{}'@'%' IDENTIFIED BY '{}'; ALTER USER '{}'@'%' IDENTIFIED BY '{}'; GRANT ALL PRIVILEGES ON `{}`.* TO '{}'@'%'; FLUSH PRIVILEGES;", environment.database_name, environment.database_user, environment.database_password, environment.database_user, environment.database_password, environment.database_name, environment.database_user);
    let args = vec![
        "compose".into(),
        "exec".into(),
        "-T".into(),
        "database".into(),
        client.into(),
        "-uroot".into(),
        format!("-p{}", environment.database_root_password),
        "-e".into(),
        sql,
    ];
    let output = compose_exec(executable, directory, &args)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
    }
}

fn ensure_network(executable: &str) -> Result<(), String> {
    let inspected = runtime_command(executable)
        .args(["network", "inspect", "lspanel"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if inspected.is_ok_and(|status| status.success()) {
        return Ok(());
    }
    let output = runtime_command(executable)
        .args(["network", "create", "lspanel"])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    // Two environments can start at nearly the same time and both see the
    // network missing from `network inspect` before either finishes
    // `network create`; the loser's create fails with an "already exists"
    // style error even though the network is now present and usable either
    // way, so that specific failure isn't a real problem.
    if is_network_already_exists_error(&error) {
        Ok(())
    } else {
        Err(error)
    }
}

/// Builds the gateway's fallback ("no project matched this host") server
/// blocks for plain HTTP and HTTPS. Every `https_proxy_block()` listens on
/// 443 without a `default_server` marker, so without an explicit one here,
/// nginx would fall back to whichever real site's block happens to be first
/// in the generated file for any request whose Host/SNI doesn't match a
/// known project - silently proxying it there instead of returning a clean
/// 404 (and making the "Local HTTPS" health check, which probes with an
/// unrecognized hostname, look unhealthy even though the gateway is fine).
fn gateway_not_found_blocks(not_found_body: &str) -> (String, String) {
    (
        format!(
            "server {{ listen 80 default_server; server_name _; default_type text/html; return 404 '{not_found_body}'; }}"
        ),
        format!(
            "server {{ listen 443 ssl default_server; server_name _; ssl_certificate /etc/nginx/tls/local.crt; ssl_certificate_key /etc/nginx/tls/local.key; ssl_protocols TLSv1.2 TLSv1.3; default_type text/html; return 404 '{not_found_body}'; }}"
        ),
    )
}

fn ensure_gateway(app: &tauri::AppHandle, executable: &str) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("gateway");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let sites = crate::sites::list(app)?;
    let environments = list(app)?;
    // Every site's hostnames are included here, not just enabled ones, so the
    // local CA certificate covers a stopped project's domain too - it still
    // needs a valid HTTPS response (the "project stopped" block below),
    // rather than a cert error, when visited while its environment is off.
    let mut hostnames = sites
        .iter()
        .flat_map(|site| std::iter::once(site.domain.clone()).chain(site.aliases.clone()))
        .collect::<Vec<_>>();
    let mut blocks = sites
        .iter()
        .filter(|site| site.enabled)
        .filter_map(|site| {
            environments
                .iter()
                .find(|environment| environment.id == site.environment_id)
                .map(|environment| {
                    let target = if crate::project_templates::is_node_project(&site.project_type) {
                        format!("lsp-{}-node:3000", environment.id)
                    } else {
                        format!("lsp-{}:80", environment.id)
                    };
                    https_proxy_block(&site_hostnames(site), &target)
                })
        })
        .collect::<Vec<_>>();
    blocks.extend(
        sites
            .iter()
            .filter(|site| !site.enabled)
            .map(|site| stopped_site_block(&site_hostnames(site), &site.name)),
    );
    for environment in &environments {
        for (service, port) in [
            ("mailpit", 8025),
            ("adminer", 80),
            ("phpmyadmin", 80),
            ("elasticsearch", 9200),
            ("minio", 9001),
            ("rabbitmq", 15672),
        ] {
            if environment
                .extra_services
                .iter()
                .any(|item| item == service)
            {
                let hostname = service_hostname(service, &environment.name);
                hostnames.push(hostname.clone());
                blocks.push(https_proxy_block(
                    &hostname,
                    &format!("lsp-{}-{}:{}", environment.id, service, port),
                ));
            }
        }
    }
    hostnames.sort();
    hostnames.dedup();
    if hostnames.is_empty() {
        hostnames.push("lspanel.localhost".into());
    }
    let gateway_aliases = hostnames
        .iter()
        .map(|hostname| serde_json::to_string(hostname).unwrap())
        .collect::<Vec<_>>()
        .join(", ");
    let certificates = crate::tls::ensure(app, hostnames.clone())?;
    fs::copy(certificates.certificate, directory.join("local.crt"))
        .map_err(|error| error.to_string())?;
    fs::copy(certificates.key, directory.join("local.key")).map_err(|error| error.to_string())?;
    let live_links = crate::livelink::active_links(app);
    let live_blocks = live_links
        .iter()
        .filter_map(|link| {
            let site = sites.iter().find(|site| site.id == link.site_id)?;
            if !site.enabled {
                return None;
            }
            let environment = environments
                .iter()
                .find(|environment| environment.id == site.environment_id)?;
            let target = if crate::project_templates::is_node_project(&site.project_type) {
                format!("lsp-{}-node:3000", environment.id)
            } else {
                format!("lsp-{}:80", environment.id)
            };
            Some(live_link_proxy_block(
                &site.domain,
                &target,
                link.local_port,
                link.port,
            ))
        })
        .collect::<Vec<_>>();
    let (http_not_found, https_fallback) = gateway_not_found_blocks(
        "<!doctype html><title>LS Panel</title><style>body{font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0}main{text-align:center}p{color:#999}</style><main><h1>Local site not found</h1><p>Check the domain and start its environment in LS Panel.</p></main>",
    );
    let fallback = if live_blocks.is_empty() {
        http_not_found
    } else {
        live_blocks.join("\n")
    };
    let redirect = format!(
        "server {{ listen 80; server_name {}; return 301 https://$host$request_uri; }}",
        hostnames.join(" ")
    );
    let gzip = "gzip on;\ngzip_vary on;\ngzip_comp_level 5;\ngzip_min_length 256;\ngzip_proxied any;\ngzip_types text/plain text/css text/javascript application/javascript application/json application/xml application/xml+rss image/svg+xml font/woff2 font/woff;\nclient_max_body_size 1024m;\n";
    let blocks = format!(
        "{}{}\n{}\n{}\n{}",
        gzip,
        fallback,
        https_fallback,
        redirect,
        blocks.join("\n")
    );
    fs::write(directory.join("default.conf"), blocks).map_err(|error| error.to_string())?;
    let mut published_ports = vec![
        "\"127.0.0.1:80:80\"".to_owned(),
        "\"127.0.0.1:443:443\"".to_owned(),
    ];
    published_ports.extend(
        live_links
            .iter()
            .map(|link| format!("\"127.0.0.1:{0}:{0}\"", link.local_port)),
    );
    fs::write(directory.join("compose.yaml"), format!("name: lspanel-gateway\nservices:\n  gateway:\n    image: docker.io/library/nginx:1.28-alpine\n    ports: [{}]\n    volumes: [\"./default.conf:/etc/nginx/conf.d/default.conf:ro\", \"./local.crt:/etc/nginx/tls/local.crt:ro\", \"./local.key:/etc/nginx/tls/local.key:ro\"]\n    networks:\n      lspanel:\n        aliases: [{}]\n    restart: unless-stopped\nnetworks:\n  lspanel:\n    external: true\n", published_ports.join(", "), gateway_aliases)).map_err(|error| error.to_string())?;
    // Rootless Docker/Podman providers can try to create the replacement
    // container before rootlessport has released 80/443 from the old gateway.
    // Recreate our generated Compose project from a clean state; unrelated
    // host web servers, application stacks and the external network are never
    // touched.
    let _ = crate::process::output(
        runtime_command(executable)
            .args(["compose", "down", "--remove-orphans", "--timeout", "5"])
            .current_dir(&directory)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "existing gateway shutdown",
    );
    let mut output = runtime_command(executable)
        .args(["compose", "up", "-d", "--force-recreate"])
        .current_dir(&directory)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    let first_error = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() && is_transient_recreate_error(&first_error) {
        drop(first_error);
        thread::sleep(Duration::from_millis(500));
        output = runtime_command(executable)
            .args(["compose", "up", "-d", "--force-recreate"])
            .current_dir(&directory)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| error.to_string())?;
    }
    if output.status.success() {
        Ok(())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        Err(
            if error.contains("address already in use")
                || error.contains("port is already allocated")
            {
                "Port 80 or 443 is already in use. Stop the service using the local HTTP(S) ports, then try again."
                    .into()
            } else {
                error
            },
        )
    }
}

/// Both of these are the same underlying race: `compose down` returns before
/// the daemon has fully released the old gateway container's port binding
/// and/or its name from the container name registry, so the immediately
/// following `compose up` can fail as if the old container were still there.
/// One short retry clears it without surfacing a spurious error to the user.
fn is_transient_recreate_error(stderr: &str) -> bool {
    stderr.contains("address already in use")
        || stderr.contains("port is already allocated")
        || stderr.contains("is already in use by container")
}

/// Matches Docker's and Podman's differently-worded "a network with this
/// name already exists" errors from `network create`.
fn is_network_already_exists_error(stderr: &str) -> bool {
    stderr.contains("already exists") || stderr.contains("already used")
}

pub(crate) fn refresh_gateway(app: &tauri::AppHandle) -> Result<(), String> {
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or_else(|| format!("Cannot refresh the local gateway: {}", runtime.message))?;
    ensure_network(&executable)?;
    ensure_gateway(app, &executable)
}

pub(crate) fn remove_gateway(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("gateway");
    if !directory.exists() {
        return Ok(());
    }
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    if let Some(executable) = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
    {
        let output = runtime_command(&executable)
            .args(["compose", "down", "--remove-orphans"])
            .current_dir(&directory)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| format!("Failed to stop local HTTPS gateway: {error}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }
    }
    fs::remove_dir_all(&directory)
        .map_err(|error| format!("Failed to remove generated HTTPS gateway: {error}"))
}

pub fn shutdown(app: &tauri::AppHandle) {
    let environments = list(app).unwrap_or_default();
    let gateway = app
        .path()
        .app_data_dir()
        .ok()
        .map(|directory| directory.join("gateway"));

    // The preferred runtime can be changed while the panel is open. Stop
    // LS Panel stacks in both engines so containers started before such a
    // switch cannot survive application shutdown.
    for executable in ["docker", "podman"].into_iter().filter_map(|name| {
        let status = detect_runtime(Some(name));
        if status.running && status.compose_available {
            status.runtime
        } else {
            None
        }
    }) {
        for environment in environments
            .iter()
            .filter(|environment| environment.runtime_mode != "native")
        {
            let Ok(directory) = stack_directory(app, &environment.id) else {
                continue;
            };
            if !directory.join("compose.yaml").is_file() {
                continue;
            }
            let _ = crate::process::output(
                runtime_command(&executable)
                    .args(["compose", "stop", "--timeout", "10"])
                    .current_dir(directory)
                    .stdin(Stdio::null()),
                crate::process::SHORT_TIMEOUT,
                "environment shutdown",
            );
        }
        if let Some(gateway) = gateway
            .as_ref()
            .filter(|directory| directory.join("compose.yaml").is_file())
        {
            let _ = crate::process::output(
                runtime_command(&executable)
                    .args(["compose", "stop", "--timeout", "5"])
                    .current_dir(gateway)
                    .stdin(Stdio::null()),
                crate::process::SHORT_TIMEOUT,
                "gateway shutdown",
            );
        }
    }
}

pub(crate) fn verify_environment_sites(
    app: &tauri::AppHandle,
    environment_id: &str,
) -> Result<(), String> {
    for site in crate::sites::list(app)?
        .into_iter()
        .filter(|site| site.environment_id == environment_id && site.enabled)
    {
        let mut last = "gateway did not respond".to_owned();
        let mut ready = false;
        for _ in 0..30 {
            match local_http_status(&site.domain) {
                Ok(status) if route_status_is_available(status) => {
                    ready = true;
                    break;
                }
                Ok(status) => last = format!("HTTP {status}"),
                Err(error) => last = error,
            }
            thread::sleep(Duration::from_millis(500));
        }
        if !ready {
            return Err(format!("Local route http://{} is unavailable after 15 seconds ({last}). Check the web service logs and gateway configuration.", site.domain));
        }
    }
    Ok(())
}

pub fn refresh_site_routes(app: &tauri::AppHandle, environment_id: &str) -> Result<(), String> {
    let environment = list(app)?
        .into_iter()
        .find(|item| item.id == environment_id)
        .ok_or("Environment not found")?;
    if environment.runtime_mode == "native" {
        return Ok(());
    }
    let was_running = environment_status(app, environment_id)
        .map(|state| state.status == "running")
        .unwrap_or(false);
    let directory = prepare(app, &environment)?;
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or(runtime.message)?;
    ensure_network(&executable)?;

    // Compose must recreate the application services so newly generated site
    // mounts become part of the containers. A plain restart keeps old mounts.
    if was_running {
        let services: &[&str] = if environment.web_server == "Nginx" {
            &["php", "web"]
        } else {
            &["web"]
        };
        let mut args = vec!["compose", "up", "-d", "--build", "--force-recreate"];
        args.extend_from_slice(services);
        let output = runtime_command(&executable)
            .args(&args)
            .current_dir(&directory)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| error.to_string())?;
        if !output.status.success() {
            let detail = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            return Err(if detail.trim().is_empty() {
                "Failed to attach the site to its web container".into()
            } else {
                detail.trim().into()
            });
        }
    }
    ensure_gateway(app, &executable)?;
    if was_running {
        verify_environment_sites(app, environment_id)?;
    }
    Ok(())
}

pub fn inspect_environment(
    app: &tauri::AppHandle,
    id: &str,
) -> Result<EnvironmentInspection, String> {
    let environment = list(app)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or("Environment not found")?;
    if environment.runtime_mode == "native" {
        return crate::native_runtime::inspect(app, &environment);
    }
    let directory = stack_directory(app, id)?;
    let settings = crate::settings::load(app)?.ok_or("Settings not found")?;
    let site = PathBuf::from(settings.sites_directory).join(&environment.name);
    let preferred = Some(settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    let mut running_services = 0;
    let mut services = Vec::new();
    let mut logs = String::new();
    let provisioned = directory.join("compose.yaml").exists();
    if provisioned {
        if let Some(executable) = runtime
            .runtime
            .filter(|_| runtime.running && runtime.compose_available)
        {
            let ps = runtime_command(&executable)
                .args(["compose", "ps", "--all", "--format", "json"])
                .current_dir(&directory)
                .stdin(Stdio::null())
                .output()
                .map_err(|e| e.to_string())?;
            if ps.status.success() {
                services = parse_service_inspections(&String::from_utf8_lossy(&ps.stdout));
                running_services = services
                    .iter()
                    .filter(|service| service.state == "running")
                    .count();
            }
            if let Ok(stats) = runtime_command(&executable)
                .args(["compose", "stats", "--no-stream", "--format", "json"])
                .current_dir(&directory)
                .stdin(Stdio::null())
                .output()
            {
                if stats.status.success() {
                    apply_service_stats(&mut services, &String::from_utf8_lossy(&stats.stdout));
                }
            }
            if let Ok(output) = runtime_command(&executable)
                .args(["compose", "logs", "--no-color", "--tail", "120"])
                .current_dir(&directory)
                .stdin(Stdio::null())
                .output()
            {
                if output.status.success() {
                    logs = format!(
                        "{}{}",
                        String::from_utf8_lossy(&output.stdout),
                        String::from_utf8_lossy(&output.stderr)
                    );
                }
            }
        }
    }
    Ok(EnvironmentInspection {
        id: id.into(),
        status: if running_services > 0 {
            "running".into()
        } else {
            "stopped".into()
        },
        provisioned,
        running_services,
        services,
        logs: crate::security::redact(&logs, crate::security::environment_secrets(app, id)),
        site_directory: site.display().to_string(),
        compose_file: directory.join("compose.yaml").display().to_string(),
    })
}

pub fn clear_service_logs(
    app: &tauri::AppHandle,
    id: &str,
    service: &str,
) -> Result<String, String> {
    let (executable, directory) = service_context(app, id, service)?;
    let output = crate::process::output(
        runtime_command(&executable)
            .args([
                "compose",
                "up",
                "-d",
                "--force-recreate",
                "--no-deps",
                service,
            ])
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::INSTALL_TIMEOUT,
        "service log reset",
    )?;
    if output.status.success() {
        Ok("Logs cleared by recreating the service container".into())
    } else {
        Err(crate::security::environment_error(
            app,
            id,
            &format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ),
        ))
    }
}

pub fn service_url(app: &tauri::AppHandle, id: &str, service: &str) -> Result<String, String> {
    let _ = service_context(app, id, service)?;
    let environment = list(app)?
        .into_iter()
        .find(|environment| environment.id == id)
        .ok_or("Environment not found")?;
    if matches!(
        service,
        "mailpit" | "adminer" | "phpmyadmin" | "elasticsearch" | "minio" | "rabbitmq"
    ) {
        return Ok(format!(
            "https://{}",
            service_hostname(service, &environment.name)
        ));
    }
    if matches!(service, "web" | "php" | "node") {
        let site = crate::sites::list(app)?
            .into_iter()
            .find(|site| site.environment_id == id)
            .ok_or("This environment has no project route")?;
        return Ok(format!("https://{}", site.domain));
    }
    Err(format!("Service {service} does not expose a browser URL"))
}

pub fn environment_topology(app: &tauri::AppHandle, id: &str) -> Result<String, String> {
    let environment = list(app)?
        .into_iter()
        .find(|environment| environment.id == id)
        .ok_or("Environment not found")?;
    if environment.runtime_mode == "native" {
        return Ok("Native environment — no container network, ports or volumes.".into());
    }
    let directory = prepare(app, &environment)?;
    let settings = crate::settings::load(app)?.ok_or("Settings not found")?;
    let runtime = detect_runtime(Some(&settings.runtime));
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or(runtime.message)?;
    let output = crate::process::output(
        runtime_command(&executable)
            .args(["compose", "config", "--format", "json"])
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Compose infrastructure inspection",
    )?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Invalid Compose configuration: {error}"))?;
    let mut topology = serde_json::Map::new();
    for key in ["services", "volumes", "networks"] {
        if let Some(section) = value.get(key) {
            topology.insert(key.into(), section.clone());
        }
    }
    serde_json::to_string_pretty(&topology)
        .map(|contents| crate::security::environment_error(app, id, &contents))
        .map_err(|error| error.to_string())
}

pub fn environment_resources(
    app: &tauri::AppHandle,
    id: &str,
) -> Result<Vec<ServiceInspection>, String> {
    if let Some(environment) = list(app)?.into_iter().find(|item| item.id == id) {
        if environment.runtime_mode == "native" {
            return Ok(crate::native_runtime::resources(app, id));
        }
    }
    let directory = stack_directory(app, id)?;
    if !directory.join("compose.yaml").exists() {
        return Ok(Vec::new());
    }
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let status = detect_runtime(preferred.as_deref());
    let executable = status
        .runtime
        .filter(|_| status.running && status.compose_available)
        .ok_or(status.message)?;
    let ps = crate::process::output(
        runtime_command(&executable)
            .args(["compose", "ps", "--all", "--format", "json"])
            .current_dir(&directory)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "container status",
    )?;
    let mut services = if ps.status.success() {
        parse_service_inspections(&String::from_utf8_lossy(&ps.stdout))
    } else {
        Vec::new()
    };
    let stats = crate::process::output(
        runtime_command(&executable)
            .args(["compose", "stats", "--no-stream", "--format", "json"])
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "container resource inspection",
    )?;
    if stats.status.success() {
        apply_service_stats(&mut services, &String::from_utf8_lossy(&stats.stdout));
    }
    Ok(services)
}

pub fn environment_logs(app: &tauri::AppHandle, id: &str) -> Result<String, String> {
    let directory = stack_directory(app, id)?;
    if !directory.join("compose.yaml").exists() {
        return Ok(String::new());
    }
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or(runtime.message)?;
    let output = crate::process::output(
        runtime_command(&executable)
            .args(["compose", "logs", "--no-color", "--tail", "200"])
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "container logs",
    )?;
    if !output.status.success() {
        return Err(crate::security::environment_error(
            app,
            id,
            String::from_utf8_lossy(&output.stderr).trim(),
        ));
    }
    Ok(crate::security::environment_error(
        app,
        id,
        &format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ),
    ))
}

pub fn spawn_log_stream(
    app: &tauri::AppHandle,
    id: &str,
    service: Option<&str>,
) -> Result<LogProcess, String> {
    crate::container_logs::spawn(app, id, service)
}

/// Returns the project directory when the site's environment runs in native
/// mode, so the terminal can open a plain host shell there instead of
/// `compose exec`-ing into a container service that doesn't exist.
pub fn native_terminal_directory(
    app: &tauri::AppHandle,
    site_id: &str,
) -> Result<Option<PathBuf>, String> {
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let environment = list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Environment not found")?;
    if environment.runtime_mode == "native" {
        Ok(Some(PathBuf::from(site.directory)))
    } else {
        Ok(None)
    }
}

pub fn terminal_context(
    app: &tauri::AppHandle,
    site_id: &str,
    service: &str,
) -> Result<(String, PathBuf, Option<String>), String> {
    const SERVICES: &[&str] = &[
        "web",
        "php",
        "database",
        "redis",
        "node",
        "mailpit",
        "adminer",
        "phpmyadmin",
    ];
    if !SERVICES.contains(&service) {
        return Err("Unsupported terminal service".into());
    }
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let environment = list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Environment not found")?;
    let available = service == "web"
        || service == "database"
        || (service == "php" && environment.web_server == "Nginx")
        || environment
            .extra_services
            .iter()
            .any(|item| item == service);
    if !available {
        return Err(format!("Service {service} is not enabled"));
    }
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or(runtime.message)?;
    let working_directory = matches!(service, "web" | "php" | "node")
        .then(|| format!("/var/www/sites/{}/app", site.name));
    Ok((
        executable,
        stack_directory(app, &environment.id)?,
        working_directory,
    ))
}

pub fn environment_status(app: &tauri::AppHandle, id: &str) -> Result<EnvironmentState, String> {
    if let Some(environment) = list(app)?.into_iter().find(|item| item.id == id) {
        if environment.runtime_mode == "native" {
            return Ok(EnvironmentState {
                id: id.into(),
                status: crate::native_runtime::status(app, id),
            });
        }
    }
    let directory = stack_directory(app, id)?;
    if !directory.join("compose.yaml").exists() {
        return Ok(EnvironmentState {
            id: id.into(),
            status: "stopped".into(),
        });
    }
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    let Some(executable) = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
    else {
        return Ok(EnvironmentState {
            id: id.into(),
            status: "stopped".into(),
        });
    };
    let output = runtime_command(&executable)
        .args(["compose", "ps", "--status", "running", "-q"])
        .current_dir(directory)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    Ok(EnvironmentState {
        id: id.into(),
        status: if output.status.success() && !output.stdout.is_empty() {
            "running".into()
        } else {
            "stopped".into()
        },
    })
}

/// Returns the directory of the single site backing an environment, when the
/// environment isn't shared by multiple sites. Environment-scoped state
/// (compose/build files, database backups) lives inside that project's own
/// folder so it travels with the project on copy/export; environments shared
/// by several sites have no single owning folder and keep using app data.
pub(crate) fn environment_project_directory(
    app: &tauri::AppHandle,
    environment_id: &str,
) -> Result<Option<PathBuf>, String> {
    let sites: Vec<_> = crate::sites::list(app)?
        .into_iter()
        .filter(|site| site.environment_id == environment_id)
        .collect();
    Ok(match sites.as_slice() {
        [site] => Some(PathBuf::from(&site.directory)),
        _ => None,
    })
}

pub(crate) fn stack_directory(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !safe_resource_id(id) {
        return Err("Invalid environment identifier".into());
    }
    if let Some(directory) = environment_project_directory(app, id)? {
        return Ok(directory.join("container"));
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("stacks")
        .join(id))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedFile {
    pub name: String,
    pub content: String,
}

/// The stack-directory files `prepare` may write out for a container-backed
/// environment. Not every file exists for every environment (e.g.
/// `000-default.conf` only exists for Apache, `mailpit.ini` only when the
/// Mailpit extra service is enabled) - only files that actually exist are
/// returned.
const GENERATED_FILE_NAMES: &[&str] = &[
    "compose.yaml",
    "Dockerfile.php",
    "default.conf",
    "000-default.conf",
    "php-overrides.ini",
    "php-fpm-overrides.conf",
    "mailpit.ini",
    "msmtprc",
    "lspanel-cron",
];

pub fn generated_files(app: &tauri::AppHandle, id: &str) -> Result<Vec<GeneratedFile>, String> {
    read_generated_files(&stack_directory(app, id)?)
}

fn read_generated_files(directory: &Path) -> Result<Vec<GeneratedFile>, String> {
    GENERATED_FILE_NAMES
        .iter()
        .filter(|name| directory.join(name).is_file())
        .map(|name| {
            let content =
                fs::read_to_string(directory.join(name)).map_err(|error| error.to_string())?;
            Ok(GeneratedFile {
                name: (*name).to_owned(),
                content,
            })
        })
        .collect()
}

/// Raw MySQL/PostgreSQL data files always live in LS Panel's own app-data
/// storage, never inside a project folder: they're internal engine state
/// (permission-sensitive, not portable, thousands of files), not something a
/// project export should ever need to carry around.
pub(crate) fn database_directory(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !safe_resource_id(id) {
        return Err("Invalid environment identifier".into());
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("databases")
        .join(id))
}

/// Same reasoning as `database_directory`: Redis's raw data directory is
/// engine-internal state, not project content.
pub(crate) fn redis_directory(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !safe_resource_id(id) {
        return Err("Invalid environment identifier".into());
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("redis")
        .join(id))
}

/// Same reasoning as `database_directory`: Elasticsearch's index data is
/// engine-internal state, not project content.
pub(crate) fn elasticsearch_directory(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !safe_resource_id(id) {
        return Err("Invalid environment identifier".into());
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("elasticsearch")
        .join(id))
}

/// Same reasoning as `database_directory`: MinIO's object storage is
/// engine-internal state, not project content.
pub(crate) fn minio_directory(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !safe_resource_id(id) {
        return Err("Invalid environment identifier".into());
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("minio")
        .join(id))
}

/// Same reasoning as `database_directory`: RabbitMQ's queue/message data is
/// engine-internal state, not project content.
pub(crate) fn rabbitmq_directory(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !safe_resource_id(id) {
        return Err("Invalid environment identifier".into());
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("rabbitmq")
        .join(id))
}

pub(crate) fn prepare(
    app: &tauri::AppHandle,
    environment: &Environment,
) -> Result<PathBuf, String> {
    let directory = stack_directory(app, &environment.id)?;
    let database_dir = database_directory(app, &environment.id)?;
    let redis_dir = redis_directory(app, &environment.id)?;
    let elasticsearch_dir = elasticsearch_directory(app, &environment.id)?;
    let minio_dir = minio_directory(app, &environment.id)?;
    let rabbitmq_dir = rabbitmq_directory(app, &environment.id)?;
    let settings =
        crate::settings::load(app)?.ok_or("Сначала завершите первоначальную настройку")?;
    let sites_directory = PathBuf::from(settings.sites_directory);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    fs::create_dir_all(&sites_directory).map_err(|error| error.to_string())?;
    fs::create_dir_all(&database_dir).map_err(|error| error.to_string())?;
    for (service, service_dir) in [
        ("redis", &redis_dir),
        ("elasticsearch", &elasticsearch_dir),
        ("minio", &minio_dir),
        ("rabbitmq", &rabbitmq_dir),
    ] {
        if environment
            .extra_services
            .iter()
            .any(|item| item == service)
        {
            fs::create_dir_all(service_dir).map_err(|error| error.to_string())?;
        }
    }
    let sites: Vec<_> = crate::sites::list(app)?
        .into_iter()
        .filter(|site| site.environment_id == environment.id)
        .collect();
    if environment.web_server == "Nginx" {
        let config = sites.iter().map(|site| { let root = site_document_root(site); format!("server {{ listen 80; server_name {}; root {}; index index.php index.html; location ~ /\\. {{ deny all; }} location / {{ try_files $uri $uri/ /index.php?$query_string; }} location ~ \\.php$ {{ include fastcgi_params; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; fastcgi_pass php:9000; }} }}", site_hostnames(site), root) }).collect::<Vec<_>>().join("\n");
        fs::write(
            directory.join("default.conf"),
            if config.is_empty() {
                "server { listen 80 default_server; return 404; }\n".into()
            } else {
                config
            },
        )
        .map_err(|error| error.to_string())?;
    } else {
        let config = sites.iter().map(|site| { let root = site_document_root(site); let aliases=if site.aliases.is_empty(){String::new()}else{format!("\nServerAlias {}",site.aliases.join(" "))}; format!("<VirtualHost *:80>\nServerName {}{}\nDocumentRoot {}\n<Directory {}>\nAllowOverride All\nRequire all granted\n<FilesMatch \"^\\.\">\nRequire all denied\n</FilesMatch>\n</Directory>\n</VirtualHost>", site.domain, aliases, root, root) }).collect::<Vec<_>>().join("\n");
        fs::write(
            directory.join("000-default.conf"),
            if config.is_empty() {
                "<VirtualHost *:80>\nDocumentRoot /var/www/sites\n</VirtualHost>\n".into()
            } else {
                config
            },
        )
        .map_err(|error| error.to_string())?;
    }
    if environment
        .extra_services
        .iter()
        .any(|service| service == "mailpit")
    {
        fs::write(directory.join("msmtprc"), "defaults\nauth off\ntls off\nlogfile /var/log/msmtp.log\naccount default\nhost mailpit\nport 1025\nfrom noreply@lspanel.local\n").map_err(|error| error.to_string())?;
        fs::write(
            directory.join("mailpit.ini"),
            "sendmail_path = \"/usr/bin/msmtp -t\"\nmail.add_x_header = Off\n",
        )
        .map_err(|error| error.to_string())?;
    }
    let jit = if environment.php_jit {
        format!(
            "opcache.enable=1\nopcache.enable_cli=1\nopcache.jit={}\nopcache.jit_buffer_size={}\n",
            environment.php_jit_mode, environment.php_jit_buffer_size
        )
    } else {
        "opcache.jit=disable\nopcache.jit_buffer_size=0\n".into()
    };
    let xdebug = if environment.php_xdebug {
        format!(
            "xdebug.mode={}\nxdebug.start_with_request={}\nxdebug.client_host=host.docker.internal\nxdebug.client_port={}\nxdebug.idekey={}\n",
            environment.php_xdebug_mode,
            environment.php_xdebug_start,
            environment.php_xdebug_port,
            environment.php_xdebug_ide_key
        )
    } else {
        String::new()
    };
    fs::write(directory.join("php-overrides.ini"), format!("memory_limit = {}\nupload_max_filesize = {}\npost_max_size = {}\nmax_execution_time = {}\n{}{}", environment.php_memory_limit, environment.php_upload_limit, environment.php_post_limit, environment.php_execution_time, jit, xdebug)).map_err(|error| error.to_string())?;
    if environment.php_cron {
        fs::write(
            directory.join("lspanel-cron"),
            format!(
                "{} root {}\n",
                environment.php_cron_schedule.trim(),
                environment.php_cron_command.trim()
            ),
        )
        .map_err(|error| error.to_string())?;
    }
    if environment.web_server == "Nginx" {
        let mut fpm = format!(
            "[www]\npm = {}\npm.max_children = {}\npm.max_requests = {}\n",
            environment.php_fpm_process_manager,
            environment.php_fpm_max_children,
            environment.php_fpm_max_requests
        );
        if environment.php_fpm_process_manager == "dynamic" {
            fpm.push_str(&format!(
                "pm.start_servers = {}\npm.min_spare_servers = {}\npm.max_spare_servers = {}\n",
                environment.php_fpm_start_servers,
                environment.php_fpm_min_spare_servers,
                environment.php_fpm_max_spare_servers
            ));
        }
        fs::write(directory.join("php-fpm-overrides.conf"), fpm)
            .map_err(|error| error.to_string())?;
    }
    let sites_owner = fs::metadata(&sites_directory).map_err(|error| error.to_string())?;
    fs::write(
        directory.join("Dockerfile.php"),
        php_dockerfile(environment, sites_owner.uid(), sites_owner.gid()),
    )
    .map_err(|error| error.to_string())?;
    fs::write(
        directory.join("compose.yaml"),
        compose(
            environment,
            &sites_directory,
            &sites,
            &database_dir,
            &redis_dir,
            &elasticsearch_dir,
            &minio_dir,
            &rabbitmq_dir,
        ),
    )
    .map_err(|error| error.to_string())?;
    Ok(directory)
}

fn site_hostnames(site: &crate::sites::Site) -> String {
    std::iter::once(site.domain.as_str())
        .chain(site.aliases.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

fn site_document_root(site: &crate::sites::Site) -> String {
    let suffix = if matches!(site.project_type.as_str(), "laravel" | "symfony") {
        "/app/public"
    } else {
        "/app"
    };
    format!("/var/www/sites/{}{}", site.name, suffix)
}

fn php_dockerfile(environment: &Environment, owner_uid: u32, owner_gid: u32) -> String {
    let php_variant = if environment.web_server == "Nginx" {
        "fpm"
    } else {
        "apache"
    };
    let mut extensions = environment.php_extensions.clone();
    if environment.php_xdebug && !extensions.iter().any(|extension| extension == "xdebug") {
        extensions.push("xdebug".into());
    }
    let database_driver = if environment.database == "PostgreSQL" {
        "pdo_pgsql"
    } else {
        "pdo_mysql"
    };
    if !extensions
        .iter()
        .any(|extension| extension == database_driver)
    {
        extensions.push(database_driver.into());
    }
    let mut dockerfile = format!("FROM docker.io/library/php:{}-{}\nCOPY --from=docker.io/library/composer:{} /usr/bin/composer /usr/local/bin/composer\nCOPY --from=ghcr.io/mlocati/php-extension-installer:latest /usr/bin/install-php-extensions /usr/local/bin/\n", environment.php_version, php_variant, environment.composer_version);
    dockerfile.push_str(&format!(
        "RUN install-php-extensions {}\n",
        extensions.join(" ")
    ));
    // The bind-mounted site files keep the host user's uid/gid. Realign www-data to match
    // so php-fpm/apache workers (which run as www-data, not root) can actually write to them —
    // otherwise every write (uploads, caches, license/activation files) fails with EACCES.
    dockerfile.push_str(&format!(
        "RUN groupmod -g {gid} www-data && usermod -u {uid} -g {gid} www-data\n",
        uid = owner_uid,
        gid = owner_gid
    ));
    if environment
        .extra_services
        .iter()
        .any(|service| service == "mailpit")
    {
        dockerfile.push_str("RUN apt-get update && apt-get install -y --no-install-recommends msmtp-mta && rm -rf /var/lib/apt/lists/* && touch /var/log/msmtp.log && chmod 666 /var/log/msmtp.log\nCOPY msmtprc /etc/msmtprc\nCOPY mailpit.ini /usr/local/etc/php/conf.d/99-mailpit.ini\nRUN chmod 644 /etc/msmtprc\n");
    }
    if environment.php_cron {
        dockerfile.push_str("RUN apt-get update && apt-get install -y --no-install-recommends cron && rm -rf /var/lib/apt/lists/*\nCOPY lspanel-cron /etc/cron.d/lspanel\nRUN chmod 0644 /etc/cron.d/lspanel\n");
    }
    dockerfile.push_str("COPY php-overrides.ini /usr/local/etc/php/conf.d/90-lspanel.ini\n");
    if environment.web_server == "Nginx" {
        dockerfile
            .push_str("COPY php-fpm-overrides.conf /usr/local/etc/php-fpm.d/zz-lspanel.conf\n");
    }
    if environment.web_server == "Apache" {
        dockerfile.push_str("RUN a2enmod rewrite\n");
    }
    dockerfile
}

#[allow(clippy::too_many_arguments)]
fn compose(
    e: &Environment,
    sites_directory: &Path,
    sites: &[crate::sites::Site],
    database_directory: &Path,
    redis_directory: &Path,
    elasticsearch_directory: &Path,
    minio_directory: &Path,
    rabbitmq_directory: &Path,
) -> String {
    // Every generated environment joins the external `lspanel` network. These
    // stable aliases let applications reach services in sibling projects
    // without publishing database/cache ports on the host.
    let network_name = e.name.replace('_', "-").to_ascii_lowercase();
    let db_image = match e.database.as_str() {
        "MariaDB" => "docker.io/library/mariadb",
        "PostgreSQL" => "docker.io/library/postgres",
        _ => "docker.io/library/mysql",
    };
    let db_environment = if e.database == "PostgreSQL" {
        format!(
            "POSTGRES_DB: {}\n      POSTGRES_USER: {}\n      POSTGRES_PASSWORD: {}",
            e.database_name, e.database_user, e.database_password
        )
    } else {
        format!("MYSQL_DATABASE: {}\n      MYSQL_USER: {}\n      MYSQL_PASSWORD: {}\n      MYSQL_ROOT_PASSWORD: {}", e.database_name, e.database_user, e.database_password, e.database_root_password)
    };
    let site_rw =
        serde_json::to_string(&format!("{}:/var/www/sites", sites_directory.display())).unwrap();
    let site_ro =
        serde_json::to_string(&format!("{}:/var/www/sites:ro", sites_directory.display())).unwrap();
    let web_container_name = if e.web_container_name.is_empty() {
        format!("{}-web", e.name)
    } else {
        e.web_container_name.clone()
    };
    let database_container_name = if e.database_container_name.is_empty() {
        format!("{}-database", e.name)
    } else {
        e.database_container_name.clone()
    };
    let custom_environment = if e.environment_variables.is_empty() {
        String::new()
    } else {
        format!(
            "    environment:\n{}",
            e.environment_variables
                .iter()
                .map(|(key, value)| format!(
                    "      {}: {}\n",
                    key,
                    serde_json::to_string(value).unwrap()
                ))
                .collect::<String>()
        )
    };
    let xdebug_host = if e.php_xdebug {
        "    extra_hosts:\n      - \"host.docker.internal:host-gateway\"\n"
    } else {
        ""
    };
    let app = if e.web_server == "Nginx" {
        format!("  web:\n    container_name: {}\n    image: docker.io/library/nginx:{}\n    volumes:\n      - {}\n      - ./default.conf:/etc/nginx/conf.d/default.conf:ro\n    depends_on: [php]\n    healthcheck:\n      test: [\"CMD\", \"nginx\", \"-t\"]\n      interval: 10s\n      timeout: 3s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}\", \"web.{}.localhost\"]\n  php:\n    build:\n      context: .\n      dockerfile: Dockerfile.php\n{}{}    volumes: [{}]\n    depends_on: [database]\n    healthcheck:\n      test: [\"CMD\", \"php-fpm\", \"-t\"]\n      interval: 10s\n      timeout: 3s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"php.{}.localhost\"]\n", web_container_name, e.web_version, site_ro, e.id, network_name, custom_environment, xdebug_host, site_rw, network_name)
    } else {
        format!("  web:\n    container_name: {}\n    build:\n      context: .\n      dockerfile: Dockerfile.php\n{}{}    volumes:\n      - {}\n      - ./000-default.conf:/etc/apache2/sites-enabled/000-default.conf:ro\n    depends_on: [database]\n    healthcheck:\n      test: [\"CMD\", \"php\", \"-r\", \"exit(fsockopen('127.0.0.1', 80) ? 0 : 1);\"]\n      interval: 10s\n      timeout: 3s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}\", \"web.{}.localhost\", \"php.{}.localhost\"]\n", web_container_name, custom_environment, xdebug_host, site_rw, e.id, network_name, network_name)
    };
    let mut extras = String::new();
    if e.php_cron {
        let cron_working_directory = sites
            .first()
            .map(|site| format!("/var/www/sites/{}/app", site.name))
            .unwrap_or_else(|| "/var/www/sites".into());
        extras.push_str(&format!("  cron:\n    build:\n      context: .\n      dockerfile: Dockerfile.php\n    command: [\"cron\", \"-f\"]\n    working_dir: {}\n    volumes: [{}]\n    depends_on: [database]\n    networks:\n      default: {{}}\n      lspanel: {{}}\n", cron_working_directory, site_rw));
    }
    if e.extra_services.iter().any(|item| item == "redis") {
        let password_args = if e.redis_password.is_empty() {
            String::new()
        } else {
            format!(", \"--requirepass\", \"{}\"", e.redis_password)
        };
        let health_auth = if e.redis_password.is_empty() {
            String::new()
        } else {
            format!(", \"-a\", \"{}\"", e.redis_password)
        };
        let redis_volume_mount =
            serde_json::to_string(&format!("{}:/data", redis_directory.display())).unwrap();
        extras.push_str(&format!("  redis:\n    image: docker.io/library/redis:{}-alpine\n    command: [\"redis-server\", \"--appendonly\", \"yes\", \"--maxmemory\", \"{}\", \"--maxmemory-policy\", \"{}\"{}]\n    volumes: [{}]\n    healthcheck:\n      test: [\"CMD\", \"redis-cli\"{}, \"ping\"]\n      interval: 10s\n      timeout: 3s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"redis.{}.localhost\"]\n", e.redis_version, e.redis_memory_limit, e.redis_eviction_policy, password_args, redis_volume_mount, health_auth, network_name));
    }
    if e.extra_services.iter().any(|item| item == "elasticsearch") {
        let elasticsearch_volume_mount = serde_json::to_string(&format!(
            "{}:/usr/share/elasticsearch/data",
            elasticsearch_directory.display()
        ))
        .unwrap();
        extras.push_str(&format!("  elasticsearch:\n    image: docker.elastic.co/elasticsearch/elasticsearch:{}\n    environment:\n      discovery.type: single-node\n      xpack.security.enabled: \"false\"\n      ES_JAVA_OPTS: \"-Xms{} -Xmx{}\"\n    volumes: [{}]\n    healthcheck:\n      test: [\"CMD-SHELL\", \"curl -sf http://127.0.0.1:9200/_cluster/health || exit 1\"]\n      interval: 10s\n      timeout: 5s\n      retries: 10\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-elasticsearch\", \"elasticsearch.{}.localhost\"]\n", e.elasticsearch_version, e.elasticsearch_memory_limit, e.elasticsearch_memory_limit, elasticsearch_volume_mount, e.id, network_name));
    }
    if e.extra_services.iter().any(|item| item == "minio") {
        let minio_volume_mount =
            serde_json::to_string(&format!("{}:/data", minio_directory.display())).unwrap();
        extras.push_str(&format!("  minio:\n    image: docker.io/minio/minio:{}\n    command: [\"server\", \"/data\", \"--console-address\", \":9001\"]\n    environment:\n      MINIO_ROOT_USER: {}\n      MINIO_ROOT_PASSWORD: {}\n    volumes: [{}]\n    healthcheck:\n      test: [\"CMD\", \"mc\", \"ready\", \"local\"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-minio\", \"minio.{}.localhost\"]\n", e.minio_version, serde_json::to_string(&e.minio_root_user).unwrap(), serde_json::to_string(&e.minio_root_password).unwrap(), minio_volume_mount, e.id, network_name));
    }
    if e.extra_services.iter().any(|item| item == "rabbitmq") {
        let rabbitmq_volume_mount = serde_json::to_string(&format!(
            "{}:/var/lib/rabbitmq",
            rabbitmq_directory.display()
        ))
        .unwrap();
        extras.push_str(&format!("  rabbitmq:\n    image: docker.io/library/rabbitmq:{}-management\n    environment:\n      RABBITMQ_DEFAULT_USER: {}\n      RABBITMQ_DEFAULT_PASS: {}\n    volumes: [{}]\n    healthcheck:\n      test: [\"CMD\", \"rabbitmq-diagnostics\", \"-q\", \"ping\"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-rabbitmq\", \"rabbitmq.{}.localhost\"]\n", e.rabbitmq_version, serde_json::to_string(&e.rabbitmq_user).unwrap(), serde_json::to_string(&e.rabbitmq_password).unwrap(), rabbitmq_volume_mount, e.id, network_name));
    }
    if e.extra_services.iter().any(|item| item == "node") {
        let install = if e.node_auto_install {
            format!(
                "if [ -f package.json ]; then {} install; fi; ",
                e.node_package_manager
            )
        } else {
            String::new()
        };
        let corepack = if e.node_package_manager == "npm" {
            String::new()
        } else {
            "corepack enable; ".into()
        };
        let configured_command = if e.node_run_mode == "start" {
            e.node_start_command.trim()
        } else {
            e.node_dev_command.trim()
        };
        let command = if !configured_command.is_empty() {
            configured_command
        } else if !e.node_command.trim().is_empty() {
            e.node_command.trim()
        } else {
            "tail -f /dev/null"
        };
        // "start" mode is a production-style run (built once, then served) —
        // build before every start/restart, same as `install` above. "dev"
        // mode never builds: its whole point is running straight off source
        // with hot reload, so node_build_command is intentionally unused there.
        let build = if e.node_run_mode == "start" && !e.node_build_command.trim().is_empty() {
            format!("{}; ", e.node_build_command.trim())
        } else {
            String::new()
        };
        let startup =
            serde_json::to_string(&format!("{}{}{}{}", corepack, install, build, command)).unwrap();
        let inspector_port = if e.node_inspector {
            format!(
                "    ports: [\"127.0.0.1:{0}:{0}\"]\n",
                e.node_inspector_port
            )
        } else {
            String::new()
        };
        let inspector_environment = if e.node_inspector {
            format!(
                "    environment:\n      NODE_OPTIONS: \"--inspect=0.0.0.0:{}\"\n",
                e.node_inspector_port
            )
        } else {
            String::new()
        };
        let working_dir = sites
            .iter()
            .find(|site| crate::project_templates::is_node_project(&site.project_type))
            .map(|site| format!("/var/www/sites/{}/app", site.name))
            .unwrap_or_else(|| "/var/www/sites".into());
        extras.push_str(&format!("  node:\n    image: docker.io/library/node:{}-alpine\n    command: [\"sh\", \"-lc\", {}]\n    working_dir: {}\n{}{}    volumes: [{}]\n    healthcheck:\n      test: [\"CMD\", \"wget\", \"-qO-\", \"http://127.0.0.1:3000\"]\n      interval: 10s\n      timeout: 3s\n      retries: 10\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-node\", \"node.{}.localhost\"]\n", e.node_version, startup, working_dir, inspector_environment, inspector_port, site_rw, e.id, network_name));
    }
    if e.extra_services.iter().any(|item| item == "mailpit") {
        extras.push_str(&format!("  mailpit:\n    image: docker.io/axllent/mailpit:v1.27\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-mailpit\"]\n", e.id));
    }
    if e.extra_services.iter().any(|item| item == "adminer") {
        let driver = if e.database == "PostgreSQL" {
            "pgsql"
        } else {
            "server"
        };
        let port = if e.database == "PostgreSQL" {
            5432
        } else {
            3306
        };
        let dsn = serde_json::to_string(&format!(
            "{}://{}:{}@database:{}/{}",
            driver, e.database_user, e.database_password, port, e.database_name
        ))
        .unwrap();
        extras.push_str(&format!("  adminer:\n    image: docker.io/dockette/adminer:full\n    environment:\n      ADMINER_PLUGIN_AUTOLOGIN: \"1\"\n      ADMINER_AUTOLOGIN_SERVER: {}\n    depends_on: [database]\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-adminer\"]\n", dsn, e.id));
    }
    if e.extra_services.iter().any(|item| item == "phpmyadmin") {
        extras.push_str(&format!("  phpmyadmin:\n    image: docker.io/library/phpmyadmin:5-apache\n    environment:\n      PMA_HOST: database\n      PMA_USER: {}\n      PMA_PASSWORD: {}\n    depends_on: [database]\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"lsp-{}-phpmyadmin\"]\n", e.database_user, e.database_password, e.id));
    }
    let database_healthcheck = if e.database == "PostgreSQL" {
        format!(
            "[\"CMD-SHELL\", \"pg_isready -U {} -d {}\"]",
            e.database_user, e.database_name
        )
    } else {
        let admin = if e.database == "MariaDB" {
            "mariadb-admin"
        } else {
            "mysqladmin"
        };
        format!("[\"CMD\", \"{}\", \"ping\", \"-h\", \"127.0.0.1\", \"-uroot\", \"-p{}\", \"--silent\"]", admin, e.database_root_password)
    };
    let database_volume_mount = serde_json::to_string(&format!(
        "{}:/var/lib/{}",
        database_directory.display(),
        if e.database == "PostgreSQL" {
            "postgresql/data"
        } else {
            "mysql"
        }
    ))
    .unwrap();
    apply_runtime_defaults(format!("name: {}\nservices:\n{}  database:\n    container_name: {}\n    image: {}:{}\n    environment:\n      {}\n    volumes: [{}]\n    healthcheck:\n      test: {}\n      interval: 10s\n      timeout: 5s\n      retries: 10\n    networks:\n      default: {{}}\n      lspanel:\n        aliases: [\"database.{}.localhost\"]\n{}networks:\n  default: {{}}\n  lspanel:\n    external: true\n", e.name, app, database_container_name, db_image, e.database_version, db_environment, database_volume_mount, database_healthcheck, network_name, extras), e)
}

fn apply_runtime_defaults(mut yaml: String, environment: &Environment) -> String {
    for service in [
        "web",
        "php",
        "database",
        "redis",
        "elasticsearch",
        "minio",
        "rabbitmq",
        "node",
        "mailpit",
        "adminer",
        "phpmyadmin",
        "cron",
    ] {
        let heading = format!("  {service}:\n");
        if yaml.contains(&heading) {
            let restart = if service == "node" && !environment.node_auto_restart {
                "no"
            } else {
                &environment.restart_policy
            };
            let settings = format!(
                "    restart: {}\n    cpus: {}\n    mem_limit: {}\n",
                restart,
                serde_json::to_string(&environment.cpu_limit).unwrap(),
                environment.container_memory_limit
            );
            yaml = yaml.replacen(&heading, &format!("{heading}{settings}"), 1);
        }
    }
    yaml
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_site(project_type: &str) -> crate::sites::Site {
        crate::sites::Site {
            id: "site-test".into(),
            name: "demo".into(),
            domain: "demo.localhost".into(),
            environment_id: "env-test".into(),
            directory: "/tmp/demo".into(),
            project_type: project_type.into(),
            auto_init_git: false,
            pinned: false,
            archived: false,
            enabled: true,
            group: String::new(),
            tags: vec![],
            aliases: vec![],
            created_at: 0,
            last_started_at: None,
        }
    }

    #[test]
    fn document_root_prefers_framework_public_folder() {
        assert_eq!(
            site_document_root(&test_site("php")),
            "/var/www/sites/demo/app"
        );
        assert_eq!(
            site_document_root(&test_site("wordpress")),
            "/var/www/sites/demo/app"
        );
        assert_eq!(
            site_document_root(&test_site("laravel")),
            "/var/www/sites/demo/app/public"
        );
        assert_eq!(
            site_document_root(&test_site("symfony")),
            "/var/www/sites/demo/app/public"
        );
    }

    #[test]
    fn supports_php_85_and_rejects_unknown_php_images() {
        let mut environment = test_environment();
        environment.php_version = "8.5".into();
        assert!(validate(&environment).is_ok());
        environment.php_jit = true;
        assert!(validate(&environment).is_err());
        environment.php_extensions.push("opcache".into());
        assert!(validate(&environment).is_ok());
        environment.php_version = "9.0".into();
        assert!(validate(&environment).is_err());
    }

    #[test]
    fn rejects_unknown_platform_options_and_unsafe_image_tags() {
        let mut environment = test_environment();
        environment.web_server = "Caddy".into();
        assert!(validate(&environment).is_err());

        environment.web_server = "Nginx".into();
        environment.database = "SQLite".into();
        assert!(validate(&environment).is_err());

        environment.database = "MariaDB".into();
        environment.runtime_mode = "remote".into();
        assert!(validate(&environment).is_err());

        environment.runtime_mode = "container".into();
        environment.node_version = "22\nprivileged: true".into();
        assert!(validate(&environment).is_err());

        environment.node_version = "22".into();
        environment.redis_version.clear();
        assert!(validate(&environment).is_err());
    }

    #[test]
    fn xdebug_adds_extension_host_gateway_and_validates_settings() {
        let mut environment = test_environment();
        environment.php_xdebug = true;
        validate(&environment).unwrap();
        let dockerfile = php_dockerfile(&environment, 1000, 1000);
        assert!(dockerfile.contains("intl xdebug pdo_mysql"));
        assert!(
            dockerfile.contains("groupmod -g 1000 www-data && usermod -u 1000 -g 1000 www-data")
        );
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(yaml.contains("host.docker.internal:host-gateway"));

        environment.php_xdebug_mode = "trace".into();
        assert!(validate(&environment).is_err());
    }

    #[test]
    fn node_inspector_is_bound_to_loopback_only() {
        let mut environment = test_environment();
        environment.node_inspector = true;
        environment.node_inspector_port = 9230;
        validate(&environment).unwrap();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(yaml.contains("NODE_OPTIONS: \"--inspect=0.0.0.0:9230\""));
        assert!(yaml.contains("127.0.0.1:9230:9230"));
        assert!(!yaml.contains("ports: [\"9230:9230\"]"));
    }

    #[test]
    fn node_start_mode_runs_the_build_command_before_starting() {
        // Regression test: node_build_command was collected in the wizard,
        // validated, and persisted, but never actually executed anywhere.
        let mut environment = test_environment();
        environment.node_run_mode = "start".into();
        validate(&environment).unwrap();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        let build_at = yaml.find("pnpm build").expect("build command missing");
        let start_at = yaml.find("pnpm start").expect("start command missing");
        assert!(
            build_at < start_at,
            "build command must run before the start command"
        );
    }

    #[test]
    fn node_dev_mode_never_runs_the_build_command() {
        let mut environment = test_environment();
        environment.node_run_mode = "dev".into();
        validate(&environment).unwrap();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(!yaml.contains("pnpm build"));
        assert!(yaml.contains("pnpm dev"));
    }

    #[test]
    fn postgres_database_check_uses_server_sql_without_psql_meta_commands() {
        let query = postgres_database_exists_query("app");
        assert_eq!(query, "SELECT 1 FROM pg_database WHERE datname = 'app';");
        assert!(!query.contains("\\gexec"));
    }

    #[test]
    fn local_route_accepts_application_404_but_not_server_errors() {
        assert!(route_status_is_available(200));
        assert!(route_status_is_available(404));
        assert!(!route_status_is_available(500));
        assert!(!route_status_is_available(503));
    }
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_environment() -> Environment {
        Environment {
            id: "demo".into(),
            name: "demo".into(),
            web_server: "Nginx".into(),
            web_version: "1.28".into(),
            php_version: "8.4".into(),
            database: "MariaDB".into(),
            database_version: "11.8".into(),
            port: "8080".into(),
            web_container_name: "custom-web".into(),
            database_container_name: "custom-db".into(),
            php_extensions: vec!["intl".into()],
            extra_services: vec!["redis".into(), "node".into()],
            node_version: "22".into(),
            redis_version: "7.4".into(),
            database_name: "website".into(),
            database_user: "website_user".into(),
            database_password: "secret".into(),
            database_root_password: "root-secret".into(),
            php_memory_limit: "256M".into(),
            php_upload_limit: "64M".into(),
            php_post_limit: "64M".into(),
            php_execution_time: 120,
            php_jit: false,
            php_jit_mode: "tracing".into(),
            php_jit_buffer_size: "64M".into(),
            php_cron: false,
            php_cron_schedule: "* * * * *".into(),
            php_cron_command: "php artisan schedule:run".into(),
            php_fpm_process_manager: "dynamic".into(),
            php_fpm_max_children: 10,
            php_fpm_start_servers: 2,
            php_fpm_min_spare_servers: 1,
            php_fpm_max_spare_servers: 3,
            php_fpm_max_requests: 500,
            php_xdebug: false,
            php_xdebug_mode: "develop,debug".into(),
            php_xdebug_port: 9003,
            php_xdebug_start: "trigger".into(),
            php_xdebug_ide_key: "LSPANEL".into(),
            environment_variables: BTreeMap::from([("APP_ENV".into(), "local".into())]),
            redis_password: "redis-secret".into(),
            redis_memory_limit: "256mb".into(),
            redis_eviction_policy: "allkeys-lru".into(),
            elasticsearch_version: "8.15.3".into(),
            elasticsearch_memory_limit: "512m".into(),
            minio_version: "RELEASE.2024-11-07T00-52-20Z".into(),
            minio_root_user: "minioadmin".into(),
            minio_root_password: "minioadmin123".into(),
            rabbitmq_version: "3.13".into(),
            rabbitmq_user: "guest".into(),
            rabbitmq_password: "guest".into(),
            node_package_manager: "pnpm".into(),
            node_auto_install: true,
            node_auto_restart: true,
            node_command: "pnpm dev".into(),
            node_run_mode: "dev".into(),
            node_dev_command: "pnpm dev".into(),
            node_build_command: "pnpm build".into(),
            node_start_command: "pnpm start".into(),
            node_inspector: false,
            node_inspector_port: 9229,
            runtime_mode: "container".into(),
            composer_version: "2".into(),
            restart_policy: "unless-stopped".into(),
            cpu_limit: "2.0".into(),
            container_memory_limit: "2g".into(),
            wordpress_site_title: String::new(),
            wordpress_admin_user: String::new(),
            wordpress_admin_password: String::new(),
            wordpress_admin_email: String::new(),
            backup_schedule_enabled: false,
            backup_schedule_interval_hours: 24,
            backup_retention_count: 7,
        }
    }

    #[test]
    fn absent_status_is_consistent() {
        let status = RuntimeStatus {
            runtime: None,
            installed: false,
            running: false,
            version: None,
            compose_available: false,
            message: String::new(),
        };
        assert!(!status.running);
    }

    #[test]
    fn gateway_proxy_uses_tls_and_forwards_https_scheme() {
        let block = https_proxy_block("demo.localhost api.demo.localhost", "lsp-demo:80");
        assert!(block.contains("listen 443 ssl"));
        assert!(block.contains("ssl_protocols TLSv1.2 TLSv1.3"));
        assert!(block.contains("proxy_set_header X-Forwarded-Proto https"));
        assert!(block.contains("resolver 127.0.0.11"));
        assert!(block.contains("set $lspanel_upstream http://lsp-demo:80"));
        assert!(block.contains("proxy_pass $lspanel_upstream"));
    }

    #[test]
    fn service_hostnames_are_valid_for_legacy_environment_names() {
        assert_eq!(
            service_hostname("mailpit", "My_Project"),
            "mailpit.my-project.localhost"
        );
    }

    #[test]
    fn parses_compose_service_state_and_health() {
        let mut services = parse_service_inspections(
            r#"[{"Service":"web","State":"running","Health":"healthy"},{"Service":"database","State":"exited","Health":""}]"#,
        );
        apply_service_stats(
            &mut services,
            r#"{"Service":"web","CPUPerc":"1.25%","MemUsage":"24MiB / 2GiB","NetIO":"1kB / 2kB","BlockIO":"0B / 4kB"}"#,
        );
        assert_eq!(services.len(), 2);
        assert_eq!(services[0].name, "web");
        assert!(services[0].health.contains("CPU 1.25%"));
        assert_eq!(services[0].network_io, "1kB / 2kB");
        assert_eq!(services[1].state, "exited");
    }

    #[test]
    fn nginx_compose_contains_services_and_project_path() {
        let environment = test_environment();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites/demo"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        let dockerfile = php_dockerfile(&environment, 1000, 1000);
        assert!(yaml.contains("nginx:1.28"));
        assert!(yaml.contains("dockerfile: Dockerfile.php"));
        assert!(yaml.contains("mariadb:11.8"));
        assert!(yaml.contains("/tmp/LSP Sites/demo:/var/www/sites"));
        assert!(yaml.contains("aliases: [\"lsp-demo\", \"web.demo.localhost\"]"));
        assert!(yaml.contains("container_name: custom-web"));
        assert!(yaml.contains("container_name: custom-db"));
        assert!(yaml.contains("MYSQL_DATABASE: website"));
        assert!(yaml.contains("MYSQL_USER: website_user"));
        assert!(yaml.contains("redis:7.4-alpine"));
        assert!(yaml.contains("--requirepass"));
        assert!(yaml.contains("redis-secret"));
        assert!(yaml.contains("--maxmemory-policy"));
        assert!(yaml.contains("corepack enable;"));
        assert!(yaml.contains("pnpm install"));
        assert!(yaml.contains("pnpm dev"));
        assert!(yaml.contains("restart: unless-stopped"));
        assert!(yaml.contains("cpus: \"2.0\""));
        assert!(yaml.contains("mem_limit: 2g"));
        assert!(yaml.contains("node:22-alpine"));
        assert!(yaml.contains("networks:\n  default: {}"));
        assert!(yaml.contains("lspanel:\n    external: true"));
        assert!(yaml.contains("\"web.demo.localhost\""));
        assert!(yaml.contains("\"php.demo.localhost\""));
        assert!(yaml.contains("\"database.demo.localhost\""));
        assert!(yaml.contains("\"redis.demo.localhost\""));
        assert!(!yaml.contains("8080:80"));
        assert!(dockerfile
            .contains("COPY php-fpm-overrides.conf /usr/local/etc/php-fpm.d/zz-lspanel.conf"));

        let mut invalid = environment;
        invalid.php_fpm_process_manager = "invalid".into();
        assert!(validate(&invalid).is_err());
    }

    #[test]
    fn extra_services_generate_elasticsearch_minio_and_rabbitmq_containers() {
        let mut environment = test_environment();
        environment.extra_services =
            vec!["elasticsearch".into(), "minio".into(), "rabbitmq".into()];
        assert!(validate(&environment).is_ok());
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites/demo"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(yaml.contains("  elasticsearch:\n"));
        assert!(yaml.contains("docker.elastic.co/elasticsearch/elasticsearch:8.15.3"));
        assert!(yaml.contains("discovery.type: single-node"));
        assert!(yaml.contains("/tmp/lspanel-test-es:/usr/share/elasticsearch/data"));
        assert!(yaml
            .contains("aliases: [\"lsp-demo-elasticsearch\", \"elasticsearch.demo.localhost\"]"));
        assert!(yaml.contains("  minio:\n"));
        assert!(yaml.contains("docker.io/minio/minio:RELEASE.2024-11-07T00-52-20Z"));
        assert!(yaml.contains("MINIO_ROOT_USER: \"minioadmin\""));
        assert!(yaml.contains("/tmp/lspanel-test-minio:/data"));
        assert!(yaml.contains("aliases: [\"lsp-demo-minio\", \"minio.demo.localhost\"]"));
        assert!(yaml.contains("  rabbitmq:\n"));
        assert!(yaml.contains("docker.io/library/rabbitmq:3.13-management"));
        assert!(yaml.contains("RABBITMQ_DEFAULT_USER: \"guest\""));
        assert!(yaml.contains("/tmp/lspanel-test-rabbitmq:/var/lib/rabbitmq"));
        assert!(yaml.contains("aliases: [\"lsp-demo-rabbitmq\", \"rabbitmq.demo.localhost\"]"));

        let mut invalid = environment.clone();
        invalid.minio_root_password = "short".into();
        assert!(validate(&invalid).is_err());
        let mut invalid = environment;
        invalid.rabbitmq_password = String::new();
        assert!(validate(&invalid).is_err());
    }

    #[test]
    fn php_cron_generates_a_dedicated_service_and_validates_schedule() {
        let mut environment = test_environment();
        environment.php_cron = true;
        environment.php_cron_schedule = "*/5 * * * *".into();
        environment.php_cron_command = "php artisan schedule:run".into();

        validate(&environment).unwrap();
        let yaml = compose(
            &environment,
            Path::new("/tmp/LSP Sites/demo"),
            &[],
            Path::new("/tmp/lspanel-test-db"),
            Path::new("/tmp/lspanel-test-redis"),
            Path::new("/tmp/lspanel-test-es"),
            Path::new("/tmp/lspanel-test-minio"),
            Path::new("/tmp/lspanel-test-rabbitmq"),
        );
        assert!(yaml.contains("  cron:\n"));
        assert!(yaml.contains("command: [\"cron\", \"-f\"]"));
        assert!(yaml.contains("working_dir: /var/www/sites"));
        assert!(yaml.contains("aliases: [\"php.demo.localhost\"]"));
        assert_eq!(
            yaml.matches("lspanel: {}").count(),
            1,
            "cron joins the shared network; PHP declares its stable alias"
        );
        assert!(php_dockerfile(&environment, 1000, 1000)
            .contains("COPY lspanel-cron /etc/cron.d/lspanel"));

        environment.php_cron_schedule = "every minute".into();
        assert!(validate(&environment).is_err());
    }

    #[test]
    fn container_configuration_matrix_generates_real_services() {
        for web_server in ["Apache", "Nginx"] {
            for database in ["MySQL", "MariaDB", "PostgreSQL"] {
                let mut environment = test_environment();
                environment.web_server = web_server.into();
                environment.database = database.into();
                environment.database_version = match database {
                    "MySQL" => "8.4",
                    "MariaDB" => "11.8",
                    _ => "17",
                }
                .into();
                environment.php_extensions = vec!["gd".into(), "intl".into(), "redis".into()];
                environment.extra_services = vec![
                    "redis".into(),
                    "node".into(),
                    "mailpit".into(),
                    "adminer".into(),
                ];

                validate(&environment).unwrap();
                let yaml = compose(
                    &environment,
                    Path::new("/tmp/LSP Sites/demo"),
                    &[],
                    Path::new("/tmp/lspanel-test-db"),
                    Path::new("/tmp/lspanel-test-redis"),
                    Path::new("/tmp/lspanel-test-es"),
                    Path::new("/tmp/lspanel-test-minio"),
                    Path::new("/tmp/lspanel-test-rabbitmq"),
                );
                let dockerfile = php_dockerfile(&environment, 1000, 1000);

                assert!(yaml.contains("  web:\n"));
                assert!(yaml.contains("  database:\n"));
                assert!(yaml.contains("  redis:\n"));
                assert!(yaml.contains("  node:\n"));
                assert!(yaml.contains("  mailpit:\n"));
                assert!(yaml.contains("  adminer:\n"));
                assert!(dockerfile.contains(if web_server == "Nginx" {
                    "php:8.4-fpm"
                } else {
                    "php:8.4-apache"
                }));
                assert!(dockerfile.contains("install-php-extensions gd intl redis"));
                assert!(dockerfile.contains(if database == "PostgreSQL" {
                    "pdo_pgsql"
                } else {
                    "pdo_mysql"
                }));
                assert!(dockerfile.contains("msmtp-mta"));
                assert_eq!(
                    dockerfile.contains("a2enmod rewrite"),
                    web_server == "Apache"
                );
                assert!(yaml.contains(match database {
                    "MySQL" => "mysql:8.4",
                    "MariaDB" => "mariadb:11.8",
                    _ => "postgres:17",
                }));
            }
        }
    }

    #[test]
    fn phpmyadmin_is_generated_only_for_mysql_compatible_databases() {
        for database in ["MySQL", "MariaDB"] {
            let mut environment = test_environment();
            environment.database = database.into();
            environment.extra_services = vec!["phpmyadmin".into()];
            validate(&environment).unwrap();
            assert!(compose(
                &environment,
                Path::new("/tmp/sites"),
                &[],
                Path::new("/tmp/lspanel-test-db"),
                Path::new("/tmp/lspanel-test-redis"),
                Path::new("/tmp/lspanel-test-es"),
                Path::new("/tmp/lspanel-test-minio"),
                Path::new("/tmp/lspanel-test-rabbitmq")
            )
            .contains("  phpmyadmin:\n"));
        }

        let mut postgres = test_environment();
        postgres.database = "PostgreSQL".into();
        postgres.extra_services = vec!["phpmyadmin".into()];
        assert!(validate(&postgres).is_err());
    }

    fn write_smoke_stack(directory: &Path, environment: &Environment) {
        fs::create_dir_all(directory.join("sites")).unwrap();
        fs::write(
            directory.join("compose.yaml"),
            compose(
                environment,
                &directory.join("sites"),
                &[],
                Path::new("/tmp/lspanel-test-db"),
                Path::new("/tmp/lspanel-test-redis"),
                Path::new("/tmp/lspanel-test-es"),
                Path::new("/tmp/lspanel-test-minio"),
                Path::new("/tmp/lspanel-test-rabbitmq"),
            ),
        )
        .unwrap();
        fs::write(
            directory.join("Dockerfile.php"),
            php_dockerfile(environment, 1000, 1000),
        )
        .unwrap();
        fs::write(directory.join("php-overrides.ini"), "memory_limit=128M\n").unwrap();
        fs::write(
            directory.join("000-default.conf"),
            "<VirtualHost *:80>\nDocumentRoot /var/www/sites\n</VirtualHost>\n",
        )
        .unwrap();
    }

    #[test]
    fn generated_files_only_returns_known_files_that_actually_exist() {
        let directory =
            std::env::temp_dir().join(format!("lspanel-generated-files-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        write_smoke_stack(&directory, &test_environment());
        // A file that isn't in the known list must never be exposed through
        // this read-only viewer, even though it lives in the same directory.
        fs::write(directory.join("secret.env"), "SHOULD_NOT_APPEAR=1\n").unwrap();

        let files = read_generated_files(&directory).unwrap();
        let names: Vec<&str> = files.iter().map(|file| file.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "compose.yaml",
                "Dockerfile.php",
                "000-default.conf",
                "php-overrides.ini"
            ]
        );
        assert!(files
            .iter()
            .find(|file| file.name == "php-overrides.ini")
            .unwrap()
            .content
            .contains("memory_limit=128M"));

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    #[ignore = "requires a running Docker daemon and may download container images"]
    fn docker_smoke_starts_generated_stack() {
        let suffix = format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let directory = std::env::temp_dir().join(format!("lspanel-smoke-{suffix}"));
        let mut environment = test_environment();
        environment.id = format!("smoke-{suffix}");
        environment.name = format!("lspanel-smoke-{suffix}");
        environment.web_server = "Apache".into();
        environment.web_container_name = format!("lspanel-smoke-web-{suffix}");
        environment.database_container_name = format!("lspanel-smoke-db-{suffix}");
        environment.database = "MariaDB".into();
        environment.extra_services.clear();
        environment.php_extensions.clear();
        write_smoke_stack(&directory, &environment);

        let network_exists = runtime_command("docker")
            .args(["network", "inspect", "lspanel"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success());
        if !network_exists {
            let status = runtime_command("docker")
                .args(["network", "create", "lspanel"])
                .status()
                .expect("Docker is required for this opt-in test");
            assert!(
                status.success(),
                "could not create the lspanel Docker network"
            );
        }

        let config = runtime_command("docker")
            .args(["compose", "config", "--quiet"])
            .current_dir(&directory)
            .status()
            .expect("Docker Compose v2 is required");
        assert!(
            config.success(),
            "generated Compose configuration is invalid"
        );
        let up = runtime_command("docker")
            .args([
                "compose",
                "up",
                "-d",
                "--build",
                "--wait",
                "--wait-timeout",
                "180",
            ])
            .current_dir(&directory)
            .status();
        let stop = up.as_ref().ok().filter(|status| status.success()).map(|_| {
            runtime_command("docker")
                .args(["compose", "stop"])
                .current_dir(&directory)
                .status()
        });
        let start = stop
            .as_ref()
            .and_then(|status| status.as_ref().ok())
            .filter(|status| status.success())
            .map(|_| {
                runtime_command("docker")
                    .args(["compose", "up", "-d"])
                    .current_dir(&directory)
                    .status()
            });
        let restart = start
            .as_ref()
            .and_then(|status| status.as_ref().ok())
            .filter(|status| status.success())
            .map(|_| {
                runtime_command("docker")
                    .args(["compose", "restart"])
                    .current_dir(&directory)
                    .status()
            });
        let ps = restart
            .as_ref()
            .and_then(|status| status.as_ref().ok())
            .filter(|status| status.success())
            .map(|_| {
                runtime_command("docker")
                    .args(["compose", "ps", "--status", "running", "--services"])
                    .current_dir(&directory)
                    .output()
            });
        let down = runtime_command("docker")
            .args(["compose", "down", "--volumes", "--remove-orphans"])
            .current_dir(&directory)
            .status();
        let remaining = runtime_command("docker")
            .args(["compose", "ps", "--all", "--quiet"])
            .current_dir(&directory)
            .output();
        let _ = fs::remove_dir_all(&directory);

        assert!(
            up.is_ok_and(|status| status.success()),
            "generated stack did not become healthy"
        );
        assert!(
            stop.is_some_and(|result| result.is_ok_and(|status| status.success())),
            "generated stack did not stop"
        );
        assert!(
            start.is_some_and(|result| result.is_ok_and(|status| status.success())),
            "generated stack did not start again"
        );
        assert!(
            restart.is_some_and(|result| result.is_ok_and(|status| status.success())),
            "generated stack did not restart"
        );
        let output = ps
            .expect("stack did not start")
            .expect("could not inspect the stack");
        let services = String::from_utf8_lossy(&output.stdout);
        assert!(
            output.status.success() && services.contains("web") && services.contains("database"),
            "expected web and database services to be running; got: {services}"
        );
        assert!(
            down.is_ok_and(|status| status.success()),
            "generated stack was not deleted"
        );
        let remaining = remaining.expect("could not check deleted stack");
        assert!(
            remaining.status.success() && remaining.stdout.is_empty(),
            "containers remain after stack deletion"
        );
    }

    #[test]
    fn transient_recreate_errors_are_recognized() {
        // Regression test: the gateway's recreate-on-restart retry originally
        // only covered the port-binding race ("port is already allocated"),
        // not the equally-common "container name already in use" race that
        // happens when `compose down` returns before the daemon has fully
        // released the old container's name.
        assert!(is_transient_recreate_error(
            "Bind for 0.0.0.0:443 failed: port is already allocated"
        ));
        assert!(is_transient_recreate_error(
            "Error response from daemon: Conflict. The container name \"/lspanel-gateway-gateway-1\" is already in use by container \"abc123\""
        ));
        assert!(is_transient_recreate_error("address already in use"));
        assert!(!is_transient_recreate_error("no such file or directory"));
    }

    #[test]
    fn both_gateway_fallback_blocks_declare_default_server() {
        // Regression test: the HTTPS fallback lacked a `default_server`
        // marker, so nginx silently proxied any unrecognized Host/SNI to
        // whichever real site's block happened to be listed first instead
        // of returning the intended 404, which also made the "Local HTTPS"
        // health check (which probes with an unrecognized hostname) report
        // unhealthy even when the gateway was working correctly.
        let (http, https) = gateway_not_found_blocks("body");
        assert!(http.contains("listen 80 default_server"));
        assert!(https.contains("listen 443 ssl default_server"));
        assert!(https.contains("ssl_certificate /etc/nginx/tls/local.crt"));
        assert!(https.contains("ssl_certificate_key /etc/nginx/tls/local.key"));
        assert!(http.contains("return 404 'body'"));
        assert!(https.contains("return 404 'body'"));
    }

    #[test]
    fn network_already_exists_errors_are_recognized() {
        // Regression test: two environments starting at nearly the same
        // time can both see `network inspect lspanel` fail before either
        // finishes `network create lspanel`; the loser must not surface
        // this as a real error since the network exists and works either
        // way.
        assert!(is_network_already_exists_error(
            "Error response from daemon: network with name lspanel already exists"
        ));
        assert!(is_network_already_exists_error(
            "network name lspanel already used"
        ));
        assert!(!is_network_already_exists_error(
            "no such file or directory"
        ));
    }

    #[test]
    fn database_charset_defaults_to_utf8mb4() {
        let mut environment = test_environment();
        environment.environment_variables.remove("DB_CHARSET");
        assert_eq!(database_charset(&environment), "utf8mb4");
    }

    #[test]
    fn database_charset_uses_a_valid_wizard_selection() {
        let mut environment = test_environment();
        environment
            .environment_variables
            .insert("DB_CHARSET".into(), "utf8".into());
        assert_eq!(database_charset(&environment), "utf8");
    }

    #[test]
    fn database_charset_rejects_values_that_are_not_a_safe_identifier() {
        // A charset name is interpolated directly into `CREATE DATABASE ...
        // CHARACTER SET {charset}` with no further escaping — reject
        // anything that isn't alphanumeric/underscore rather than trusting
        // an environment_variables entry that a user could have hand-edited.
        let mut environment = test_environment();
        environment
            .environment_variables
            .insert("DB_CHARSET".into(), "utf8mb4; DROP TABLE users;".into());
        assert_eq!(database_charset(&environment), "utf8mb4");
    }
}
