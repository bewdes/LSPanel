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
            "8.1" | "8.2" | "8.3" | "8.4"
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
    fs::create_dir_all(&settings.sites_directory)
        .map_err(|e| format!("Не удалось создать директорию сайтов: {e}"))?;
    crate::storage::save_settings(
        app,
        &serde_json::to_string(&settings).map_err(|e| e.to_string())?,
    )?;
    Ok(settings)
}
