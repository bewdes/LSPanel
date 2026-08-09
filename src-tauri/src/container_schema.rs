use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
