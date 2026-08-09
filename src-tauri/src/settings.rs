use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub completed: bool,
    pub language: String,
    pub sites_directory: String,
    pub theme: String,
    pub runtime: String,
    pub compact_sidebar: bool,
    pub reduce_motion: bool,
    pub confirm_destructive: bool,
    pub default_web_server: String,
    pub default_php_version: String,
    pub default_node_version: String,
    pub default_database: String,
    pub default_database_version: String,
    pub auto_init_git: bool,
    pub auto_start_projects: bool,
    pub preferred_editor: String,
    pub custom_editor_command: String,
    pub notify_on_operations: bool,
    pub disk_space_alert_enabled: bool,
    pub disk_space_alert_threshold_gb: u32,
    pub auto_stop_idle_enabled: bool,
    pub auto_stop_idle_minutes: u32,
    pub auto_heal_enabled: bool,
    pub git_status_notify_enabled: bool,
    pub git_status_behind_threshold: u32,
    pub tls_expiry_notify_enabled: bool,
    pub tls_expiry_warning_days: u32,
    pub webhook_url: String,
    pub preferred_terminal: String,
    pub custom_terminal_command: String,
    pub preferred_browser: String,
    pub custom_browser_command: String,
    pub docker_buildkit_enabled: bool,
    pub stats_refresh_interval_seconds: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            completed: false,
            language: "uk".into(),
            sites_directory: String::new(),
            theme: "dark".into(),
            runtime: "auto".into(),
            compact_sidebar: false,
            reduce_motion: false,
            confirm_destructive: true,
            default_web_server: "Nginx".into(),
            default_php_version: "8.4".into(),
            default_node_version: "22".into(),
            default_database: "MariaDB".into(),
            default_database_version: "11.8".into(),
            auto_init_git: true,
            auto_start_projects: true,
            preferred_editor: "code".into(),
            custom_editor_command: String::new(),
            notify_on_operations: true,
            disk_space_alert_enabled: true,
            disk_space_alert_threshold_gb: 5,
            auto_stop_idle_enabled: false,
            auto_stop_idle_minutes: 60,
            auto_heal_enabled: false,
            git_status_notify_enabled: false,
            git_status_behind_threshold: 5,
            tls_expiry_notify_enabled: true,
            tls_expiry_warning_days: 14,
            webhook_url: String::new(),
            preferred_terminal: "auto".into(),
            custom_terminal_command: String::new(),
            preferred_browser: "system".into(),
            custom_browser_command: String::new(),
            docker_buildkit_enabled: true,
            stats_refresh_interval_seconds: 3,
        }
    }
}

pub fn load(app: &tauri::AppHandle) -> Result<Option<AppSettings>, String> {
    let Some(data) = crate::storage::load_settings(app)? else {
        return Ok(None);
    };
    let mut settings: AppSettings = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    if settings.language == "ru" {
        settings.language = "uk".into();
    }
    Ok(Some(settings))
}

pub fn save(app: &tauri::AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    if !matches!(settings.language.as_str(), "en" | "uk") {
        return Err("Unsupported language".into());
    }
    if !matches!(settings.theme.as_str(), "dark" | "light" | "system") {
        return Err("Неподдерживаемая тема".into());
    }
    if !matches!(settings.runtime.as_str(), "auto" | "docker" | "podman") {
        return Err("Unsupported container runtime".into());
    }
    if !matches!(settings.default_web_server.as_str(), "Nginx" | "Apache")
        || !matches!(
            settings.default_php_version.as_str(),
            "8.1" | "8.2" | "8.3" | "8.4" | "8.5"
        )
        || !matches!(
            settings.default_database.as_str(),
            "MariaDB" | "MySQL" | "PostgreSQL"
        )
    {
        return Err("Unsupported default project stack".into());
    }
    if settings.default_node_version.trim().is_empty()
        || settings.default_database_version.trim().is_empty()
    {
        return Err("Default runtime versions cannot be empty".into());
    }
    if settings.sites_directory.trim().is_empty() {
        return Err("Выберите директорию сайтов".into());
    }
    if !matches!(
        settings.preferred_editor.as_str(),
        "code" | "phpstorm" | "cursor" | "zed" | "sublime" | "custom"
    ) {
        return Err("Unsupported editor".into());
    }
    if settings.preferred_editor == "custom" && settings.custom_editor_command.trim().is_empty() {
        return Err("Custom editor command cannot be empty".into());
    }
    if settings.disk_space_alert_threshold_gb == 0 || settings.disk_space_alert_threshold_gb > 1000
    {
        return Err("Disk space alert threshold must be between 1 and 1000 GB".into());
    }
    if settings.auto_stop_idle_minutes < 5 || settings.auto_stop_idle_minutes > 1440 {
        return Err("Auto-stop idle timeout must be between 5 and 1440 minutes".into());
    }
    if settings.git_status_behind_threshold == 0 || settings.git_status_behind_threshold > 1000 {
        return Err("Git behind-commit threshold must be between 1 and 1000".into());
    }
    if settings.tls_expiry_warning_days == 0 || settings.tls_expiry_warning_days > 365 {
        return Err("TLS expiry warning must be between 1 and 365 days".into());
    }
    if !settings.webhook_url.trim().is_empty()
        && !crate::webhook::targets_public_host(settings.webhook_url.trim())
    {
        return Err("Webhook URL must start with https:// and point at a public host".into());
    }
    if !matches!(
        settings.preferred_terminal.as_str(),
        "auto" | "gnome-terminal" | "konsole" | "xfce4-terminal" | "custom"
    ) {
        return Err("Unsupported terminal".into());
    }
    if settings.preferred_terminal == "custom" && settings.custom_terminal_command.trim().is_empty()
    {
        return Err("Custom terminal command cannot be empty".into());
    }
    if !matches!(
        settings.preferred_browser.as_str(),
        "system" | "firefox" | "chrome" | "chromium" | "custom"
    ) {
        return Err("Unsupported browser".into());
    }
    if settings.preferred_browser == "custom" && settings.custom_browser_command.trim().is_empty() {
        return Err("Custom browser command cannot be empty".into());
    }
    if settings.stats_refresh_interval_seconds < 3 || settings.stats_refresh_interval_seconds > 300
    {
        return Err("Stats refresh interval must be between 3 and 300 seconds".into());
    }
    fs::create_dir_all(&settings.sites_directory)
        .map_err(|e| format!("Не удалось создать директорию сайтов: {e}"))?;
    crate::storage::save_settings(
        app,
        &serde_json::to_string(&settings).map_err(|e| e.to_string())?,
    )?;
    Ok(settings)
}
