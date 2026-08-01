use crate::containers::Environment;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub environment_id: String,
    pub directory: String,
    #[serde(default = "default_project_type")]
    pub project_type: String,
    #[serde(default)]
    pub auto_init_git: bool,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub group: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub last_started_at: Option<i64>,
}

fn default_project_type() -> String {
    "php".into()
}

fn default_enabled() -> bool {
    true
}

pub(crate) fn validate_project_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Site name may contain only letters, digits, - and _".into());
    }
    Ok(())
}

const PHP_WELCOME_TEMPLATE: &str = r#"<?php
$phpVersion = phpversion();
$server = $_SERVER['SERVER_SOFTWARE'] ?? 'unknown';
$host = $_SERVER['HTTP_HOST'] ?? '{{SITE_NAME}}.localhost';
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{SITE_NAME}}</title>
<style>
  :root {
    color-scheme: light dark;
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --border: oklch(0.922 0 0);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: oklch(0.145 0 0);
      --foreground: oklch(0.985 0 0);
      --card: oklch(0.205 0 0);
      --card-foreground: oklch(0.985 0 0);
      --primary: oklch(0.922 0 0);
      --primary-foreground: oklch(0.205 0 0);
      --secondary: oklch(0.269 0 0);
      --secondary-foreground: oklch(0.985 0 0);
      --muted: oklch(0.269 0 0);
      --muted-foreground: oklch(0.708 0 0);
      --border: oklch(1 0 0 / 10%);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    padding: 2.5rem 1.5rem;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 1.25rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--background);
    color: var(--foreground);
  }
  .wrap { width: 100%; max-width: 640px; display: grid; gap: 1.25rem; }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    width: fit-content;
    height: 1.25rem;
    padding: 0 0.5rem;
    border-radius: 999px;
    background: var(--secondary);
    color: var(--secondary-foreground);
    font-size: 0.7rem;
    font-weight: 500;
  }
  h1 { margin: 0; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.01em; }
  .lede { margin: 0.15rem 0 0; color: var(--muted-foreground); font-size: 0.875rem; }
  .card {
    background: var(--card);
    color: var(--card-foreground);
    border: 1px solid var(--border);
    border-radius: 0.875rem;
    overflow: hidden;
  }
  .card-header { padding: 1rem 1rem 0.75rem; }
  .card-title { font-size: 1rem; font-weight: 500; }
  .card-description { margin: 0.15rem 0 0; color: var(--muted-foreground); font-size: 0.875rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 0.25rem 1rem 1rem;
  }
  .field {
    grid-column: span 1;
    border: 1px solid var(--border);
    border-radius: 0.625rem;
    padding: 0.6rem 0.75rem;
  }
  .field.wide { grid-column: 1 / -1; }
  .field span { display: block; color: var(--muted-foreground); font-size: 0.75rem; }
  .field strong { display: block; margin-top: 0.15rem; font-size: 0.875rem; font-weight: 500; overflow-wrap: anywhere; }
  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
    background: color-mix(in oklch, var(--muted) 50%, transparent);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    height: 1.25rem;
    padding: 0 0.5rem;
    border-radius: 999px;
    background: var(--secondary);
    color: var(--secondary-foreground);
    font-size: 0.75rem;
    font-weight: 500;
  }
  .live {
    margin-left: auto;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }
  code {
    background: var(--muted);
    padding: 0.1rem 0.35rem;
    border-radius: 0.3rem;
    font-size: 0.85em;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div>
      <span class="eyebrow">LS Panel</span>
      <h1>Welcome to {{SITE_NAME}} 👋</h1>
      <p class="lede">Edit <code>index.php</code> to get started. This page reflects your configured environment.</p>
    </div>
    <div class="card">
      <div class="card-header">
        <div class="card-title">Site</div>
        <p class="card-description">{{DOMAIN}}</p>
      </div>
      <div class="grid">
        <div class="field"><span>Domain</span><strong>{{DOMAIN}}</strong></div>
        <div class="field"><span>Project type</span><strong>{{PROJECT_TYPE}}</strong></div>
        {{ALIASES_ROW}}
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <div class="card-title">Container environment</div>
        <p class="card-description">{{ENVIRONMENT_NAME}}</p>
      </div>
      <div class="grid">
        <div class="field"><span>Web server</span><strong>{{WEB_SERVER}}</strong></div>
        <div class="field"><span>PHP</span><strong>{{PHP_VERSION}}</strong></div>
        <div class="field"><span>Database</span><strong>{{DATABASE}}</strong></div>
        <div class="field"><span>Database name</span><strong>{{DATABASE_NAME}}</strong></div>
      </div>
      <div class="footer">
        {{SERVICES_ROW}}
        <span class="live">Running PHP <?= htmlspecialchars($phpVersion) ?> · <?= htmlspecialchars($server) ?> · <?= htmlspecialchars($host) ?></span>
      </div>
    </div>
  </div>
</body>
</html>
"#;

fn service_label(service: &str) -> Option<&'static str> {
    match service {
        "redis" => Some("Redis"),
        "node" => Some("Node.js"),
        "mailpit" => Some("Mailpit"),
        "adminer" => Some("Adminer"),
        "phpmyadmin" => Some("phpMyAdmin"),
        _ => None,
    }
}

fn default_php_index(site: &Site, environment: &Environment) -> String {
    let aliases_row = if site.aliases.is_empty() {
        String::new()
    } else {
        format!(
            "<div class=\"field wide\"><span>Aliases</span><strong>{}</strong></div>",
            site.aliases.join(", ")
        )
    };
    let services_row = environment
        .extra_services
        .iter()
        .filter_map(|service| service_label(service))
        .map(|label| format!("<span class=\"pill\">{label}</span>"))
        .collect::<Vec<_>>()
        .join("");
    PHP_WELCOME_TEMPLATE
        .replace("{{SITE_NAME}}", &site.name)
        .replace("{{DOMAIN}}", &site.domain)
        .replace("{{PROJECT_TYPE}}", &site.project_type)
        .replace("{{ALIASES_ROW}}", &aliases_row)
        .replace("{{ENVIRONMENT_NAME}}", &environment.name)
        .replace(
            "{{WEB_SERVER}}",
            &format!("{} {}", environment.web_server, environment.web_version),
        )
        .replace("{{PHP_VERSION}}", &environment.php_version)
        .replace(
            "{{DATABASE}}",
            &format!("{} {}", environment.database, environment.database_version),
        )
        .replace("{{DATABASE_NAME}}", &environment.database_name)
        .replace("{{SERVICES_ROW}}", &services_row)
}

fn write_node_starter(directory: &Path, site: &Site) -> Result<(), String> {
    let name = serde_json::to_string(&site.name).map_err(|error| error.to_string())?;
    fs::write(
        directory.join("package.json"),
        format!("{{\n  \"name\": {name},\n  \"private\": true,\n  \"scripts\": {{ \"dev\": \"node server.js\", \"start\": \"node server.js\" }}\n}}\n"),
    ).map_err(|error| error.to_string())?;
    fs::write(directory.join("server.js"), format!("const http=require('node:http');\nconst port=Number(process.env.PORT||3000);\nhttp.createServer((request,response)=>{{response.writeHead(200,{{'content-type':'text/html; charset=utf-8'}});response.end('<!doctype html><title>{0}</title><h1>{0}</h1><p>LS Panel Node.js site is running.</p>')}}).listen(port,'0.0.0.0',()=>console.log(`Listening on ${{port}}`));\n", site.name)).map_err(|error|error.to_string())
}

fn write_react_starter(directory: &Path, site: &Site) -> Result<(), String> {
    let name = serde_json::to_string(&site.name).map_err(|error| error.to_string())?;
    fs::create_dir_all(directory.join("src")).map_err(|error| error.to_string())?;
    fs::write(directory.join("package.json"), format!("{{\n  \"name\": {name},\n  \"private\": true,\n  \"version\": \"0.0.0\",\n  \"type\": \"module\",\n  \"scripts\": {{ \"dev\": \"vite --host 0.0.0.0 --port 3000\", \"build\": \"vite build\", \"start\": \"vite --host 0.0.0.0 --port 3000\" }},\n  \"dependencies\": {{ \"@vitejs/plugin-react\": \"latest\", \"vite\": \"latest\", \"react\": \"latest\", \"react-dom\": \"latest\" }}\n}}\n")).map_err(|error|error.to_string())?;
    fs::write(directory.join("index.html"), "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>React</title></head><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script></body></html>\n").map_err(|error|error.to_string())?;
    fs::write(directory.join("vite.config.js"), "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n").map_err(|error|error.to_string())?;
    fs::write(directory.join("src/main.jsx"), format!("import React from 'react'\nimport {{ createRoot }} from 'react-dom/client'\nimport './style.css'\n\nfunction App() {{\n  return <main><p>LS Panel</p><h1>{}</h1><p>Your React project is running.</p></main>\n}}\n\ncreateRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)\n", site.name)).map_err(|error|error.to_string())?;
    fs::write(directory.join("src/style.css"), ":root{font-family:Inter,system-ui,sans-serif;color:#f5f5f5;background:#111}body{margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:42rem;padding:3rem}h1{font-size:3rem;margin:.25rem 0}p{color:#aaa}\n").map_err(|error|error.to_string())
}

pub fn list(app: &tauri::AppHandle) -> Result<Vec<Site>, String> {
    crate::storage::list_sites(app)?
        .into_iter()
        .map(|data| {
            serde_json::from_str(&data).map_err(|error| format!("Invalid site record: {error}"))
        })
        .collect()
}

pub fn set_enabled(app: &tauri::AppHandle, id: &str, enabled: bool) -> Result<Site, String> {
    let mut site = list(app)?
        .into_iter()
        .find(|site| site.id == id)
        .ok_or("Site not found")?;
    site.enabled = enabled;
    let data = serde_json::to_string(&site).map_err(|error| error.to_string())?;
    crate::storage::save_site(app, &site.id, &site.environment_id, &site.domain, &data)?;
    Ok(site)
}

pub fn set_environment_enabled(
    app: &tauri::AppHandle,
    environment_id: &str,
    enabled: bool,
) -> Result<(), String> {
    for mut site in list(app)?
        .into_iter()
        .filter(|site| site.environment_id == environment_id)
    {
        if site.enabled == enabled {
            continue;
        }
        site.enabled = enabled;
        let data = serde_json::to_string(&site).map_err(|error| error.to_string())?;
        crate::storage::save_site(app, &site.id, &site.environment_id, &site.domain, &data)?;
    }
    Ok(())
}

pub fn create(app: &tauri::AppHandle, mut site: Site) -> Result<Vec<Site>, String> {
    site.name = site.name.trim().to_owned();
    site.domain = site
        .domain
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches('/')
        .to_owned();
    if site.created_at == 0 {
        site.created_at = unix_timestamp();
    }
    site.last_started_at = None;
    validate_project_name(&site.name)?;
    validate_local_domain(&site.domain)?;
    site.aliases = site
        .aliases
        .into_iter()
        .map(|alias| {
            alias
                .trim()
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .trim_end_matches('/')
                .to_lowercase()
        })
        .filter(|alias| !alias.is_empty())
        .collect();
    for alias in &site.aliases {
        validate_local_alias(alias)?;
        if alias == &site.domain {
            return Err("An alias cannot equal the primary domain".into());
        }
    }
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Selected environment does not exist")?;
    let settings = crate::settings::load(app)?.ok_or("Complete initial setup first")?;
    let directory = PathBuf::from(settings.sites_directory).join(&site.name);
    let mut sites = list(app)?;
    let requested = std::iter::once(site.domain.as_str())
        .chain(site.aliases.iter().map(String::as_str))
        .collect::<Vec<_>>();
    if sites.iter().any(|item| item.id == site.id) {
        return Err("A site with this identifier already exists".into());
    }
    if sites
        .iter()
        .any(|item| item.name == site.name || std::path::Path::new(&item.directory) == directory)
    {
        return Err("A project with this name or directory already exists".into());
    }
    if requested.iter().any(|domain| {
        sites.iter().any(|item| {
            std::iter::once(item.domain.as_str())
                .chain(item.aliases.iter().map(String::as_str))
                .any(|occupied| domains_overlap(domain, occupied))
        })
    }) {
        return Err("This domain or alias is already used".into());
    }
    if sites
        .iter()
        .any(|item| item.environment_id == site.environment_id)
    {
        return Err(
            "This container already has a project. Each container can only hold one project — create a new environment.".into(),
        );
    }
    let directory_existed = directory.exists();
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create site directory: {error}"))?;
    let app_directory = directory.join("app");
    fs::create_dir_all(&app_directory).map_err(|error| error.to_string())?;
    let content_root = if matches!(site.project_type.as_str(), "laravel" | "symfony") {
        app_directory.join("public")
    } else {
        app_directory.clone()
    };
    // Only ever fill in a starter file for a genuinely blank project. Checking
    // just for known marker files (index.php, package.json, ...) isn't
    // enough: an imported or cloned project can be substantial — its own
    // source tree, a .git history — while still lacking one of those exact
    // names at the root, and silently dropping a placeholder into it would
    // mask the real application instead of serving it.
    let app_directory_is_empty = app_directory
        .read_dir()
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(true);
    if app_directory_is_empty
        && !content_root.join("index.php").exists()
        && !content_root.join("index.html").exists()
        && !app_directory.join("public/index.php").exists()
        && !content_root.join("package.json").exists()
    {
        if site.project_type == "node" {
            write_node_starter(&content_root, &site)?;
        } else if site.project_type == "react" {
            write_react_starter(&content_root, &site)?;
        } else if site.project_type == "static" {
            fs::write(content_root.join("index.html"), format!("<!doctype html><html><head><meta charset=\"utf-8\"><title>{}</title></head><body><h1>{}</h1><p>LS Panel static site is running.</p></body></html>\n", site.name, site.name)).map_err(|error| error.to_string())?;
        } else if matches!(site.project_type.as_str(), "laravel" | "symfony") {
            fs::create_dir_all(app_directory.join("public")).map_err(|error| error.to_string())?;
            fs::write(
                app_directory.join("public/index.php"),
                "<?php http_response_code(200); echo 'Preparing Laravel…';\n",
            )
            .map_err(|error| error.to_string())?;
        } else {
            fs::write(
                content_root.join("index.php"),
                default_php_index(&site, &environment),
            )
            .map_err(|error| error.to_string())?;
        }
    }
    site.directory = directory.display().to_string();
    crate::storage::save_site(
        app,
        &site.id,
        &site.environment_id,
        &site.domain,
        &serde_json::to_string(&site).map_err(|error| error.to_string())?,
    )?;
    sites.push(site);
    if let Err(error) = crate::containers::refresh_site_routes(app, &environment.id) {
        let site = sites.last().expect("site was just added");
        let _ = crate::storage::delete_site(app, &site.id);
        let _ = crate::containers::refresh_site_routes(app, &environment.id);
        if !directory_existed {
            let _ = fs::remove_dir_all(&directory);
        }
        return Err(format!(
            "Failed to create the local site; changes were rolled back. {error}"
        ));
    }
    Ok(sites)
}

fn unix_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn mark_environment_started(
    app: &tauri::AppHandle,
    environment_id: &str,
) -> Result<(), String> {
    let timestamp = unix_timestamp();
    for mut site in list(app)?
        .into_iter()
        .filter(|site| site.environment_id == environment_id)
    {
        site.last_started_at = Some(timestamp);
        crate::storage::save_site(
            app,
            &site.id,
            &site.environment_id,
            &site.domain,
            &serde_json::to_string(&site).map_err(|error| error.to_string())?,
        )?;
    }
    Ok(())
}

pub(crate) fn validate_local_domain(domain: &str) -> Result<(), String> {
    if domain.is_empty() || domain.contains('/') || domain.contains(char::is_whitespace) {
        return Err("Enter a valid domain without protocol or path".into());
    }
    if !domain.ends_with(".localhost") {
        return Err("Beta 0.1 supports only domains ending in .localhost".into());
    }
    if domain.len() > 253
        || domain.split('.').any(|label| {
            label.is_empty()
                || label.len() > 63
                || label.starts_with('-')
                || label.ends_with('-')
                || !label
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
        })
    {
        return Err("Domain labels may contain only letters, digits and hyphens".into());
    }
    Ok(())
}

fn validate_local_alias(domain: &str) -> Result<(), String> {
    if let Some(base) = domain.strip_prefix("*.") {
        validate_local_domain(base)?;
        if base.split('.').count() < 2 {
            return Err("A wildcard alias requires a project domain after *.".into());
        }
        Ok(())
    } else {
        validate_local_domain(domain)
    }
}

fn wildcard_matches(pattern: &str, domain: &str) -> bool {
    let Some(suffix) = pattern.strip_prefix("*.") else {
        return false;
    };
    domain
        .strip_suffix(&format!(".{suffix}"))
        .is_some_and(|label| !label.is_empty() && !label.contains('.'))
}

fn domains_overlap(left: &str, right: &str) -> bool {
    left == right || wildcard_matches(left, right) || wildcard_matches(right, left)
}

pub fn delete(app: &tauri::AppHandle, id: &str, delete_files: bool) -> Result<Vec<Site>, String> {
    let site = list(app)?
        .into_iter()
        .find(|site| site.id == id)
        .ok_or("Site not found")?;
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Environment not found")?;
    let directory = PathBuf::from(&site.directory);
    let mut quarantined = None;
    if delete_files && directory.exists() {
        crate::project_templates::prepare_for_removal(app, &site, &environment)
            .map_err(|error| format!("Failed to prepare project files for deletion: {error}"))?;
        let parent = directory
            .parent()
            .ok_or("Project directory has no parent")?;
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let quarantine = parent.join(format!(".lspanel-delete-{timestamp}"));
        fs::rename(&directory, &quarantine)
            .map_err(|error| format!("Failed to prepare project files for deletion: {error}"))?;
        quarantined = Some(quarantine);
    }
    let restore = |original_error: String| {
        let mut rollback_errors = Vec::new();
        let data = serde_json::to_string(&site).map_err(|error| error.to_string())?;
        if let Err(error) =
            crate::storage::save_site(app, &site.id, &site.environment_id, &site.domain, &data)
        {
            rollback_errors.push(format!("site record: {error}"));
        }
        if let Some(quarantine) = &quarantined {
            if let Err(error) = fs::rename(quarantine, &directory) {
                rollback_errors.push(format!("project files: {error}"));
            }
        }
        if rollback_errors.is_empty() {
            Err(format!(
                "Site deletion failed and was rolled back: {original_error}"
            ))
        } else {
            Err(format!(
                "Site deletion failed: {original_error}. Rollback also failed for: {}",
                rollback_errors.join("; ")
            ))
        }
    };
    if let Err(error) = crate::storage::delete_site(app, id) {
        if let Some(quarantine) = &quarantined {
            let _ = fs::rename(quarantine, &directory);
        }
        return Err(error);
    }
    if let Err(error) = crate::containers::refresh_site_routes(app, &site.environment_id) {
        return restore(error);
    }
    if let Some(quarantine) = quarantined {
        let metadata = fs::symlink_metadata(&quarantine)
            .map_err(|error| format!("Site was deleted, but project cleanup failed: {error}"))?;
        let result = if metadata.file_type().is_dir() && !metadata.file_type().is_symlink() {
            fs::remove_dir_all(&quarantine)
        } else {
            fs::remove_file(&quarantine)
        };
        result.map_err(|error| {
            format!(
                "Site was deleted, but project files remain in {}: {error}",
                quarantine.display()
            )
        })?;
    }
    crate::snapshots::delete_all(app, &site.id)
        .map_err(|error| format!("Site was deleted, but snapshots cleanup failed: {error}"))?;
    list(app)
}

#[allow(clippy::too_many_arguments)]
pub fn update(
    app: &tauri::AppHandle,
    id: &str,
    name: &str,
    domain: &str,
    pinned: bool,
    archived: bool,
    group: &str,
    tags: Vec<String>,
    aliases: Vec<String>,
) -> Result<Vec<Site>, String> {
    let mut sites = list(app)?;
    let index = sites
        .iter()
        .position(|site| site.id == id)
        .ok_or("Site not found")?;
    let original = sites[index].clone();
    let mut updated = original.clone();
    updated.name = name.trim().to_owned();
    updated.domain = domain
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches('/')
        .to_owned();
    if updated.name.is_empty()
        || !updated
            .name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Err("Site name may contain only letters, digits, - and _".into());
    }
    validate_local_domain(&updated.domain)?;
    if sites
        .iter()
        .any(|site| site.id != id && (site.name == updated.name || site.domain == updated.domain))
    {
        return Err("Another project already uses this name or domain".into());
    }
    updated.pinned = pinned;
    updated.archived = archived;
    updated.group = group.trim().chars().take(48).collect();
    updated.tags = tags
        .into_iter()
        .map(|tag| tag.trim().chars().take(32).collect::<String>())
        .filter(|tag| !tag.is_empty())
        .fold(Vec::new(), |mut unique, tag| {
            if !unique
                .iter()
                .any(|item: &String| item.eq_ignore_ascii_case(&tag))
            {
                unique.push(tag)
            }
            unique
        })
        .into_iter()
        .take(12)
        .collect();
    updated.aliases = aliases
        .into_iter()
        .map(|alias| {
            alias
                .trim()
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .trim_end_matches('/')
                .to_lowercase()
        })
        .filter(|alias| !alias.is_empty())
        .fold(Vec::new(), |mut unique, alias| {
            if !unique.contains(&alias) {
                unique.push(alias)
            }
            unique
        })
        .into_iter()
        .take(12)
        .collect();
    for alias in &updated.aliases {
        validate_local_alias(alias)?;
        if alias == &updated.domain {
            return Err("An alias cannot equal the primary domain".into());
        }
    }
    let occupied = sites
        .iter()
        .filter(|site| site.id != id)
        .flat_map(|site| {
            std::iter::once(site.domain.as_str()).chain(site.aliases.iter().map(String::as_str))
        })
        .collect::<Vec<_>>();
    if std::iter::once(updated.domain.as_str())
        .chain(updated.aliases.iter().map(String::as_str))
        .any(|domain| {
            occupied
                .iter()
                .any(|occupied| domains_overlap(domain, occupied))
        })
    {
        return Err("Another project already uses this domain or alias".into());
    }
    let old_directory = PathBuf::from(&original.directory);
    let new_directory = old_directory
        .parent()
        .ok_or("Invalid project directory")?
        .join(&updated.name);
    let renamed = old_directory != new_directory;
    if renamed {
        if new_directory.exists() {
            return Err("The destination project directory already exists".into());
        }
        fs::rename(&old_directory, &new_directory)
            .map_err(|error| format!("Failed to rename project directory: {error}"))?;
        updated.directory = new_directory.display().to_string();
    }
    let routing_changed =
        renamed || updated.domain != original.domain || updated.aliases != original.aliases;
    let save = crate::storage::save_site(
        app,
        &updated.id,
        &updated.environment_id,
        &updated.domain,
        &serde_json::to_string(&updated).map_err(|error| error.to_string())?,
    )
    .and_then(|_| {
        if routing_changed {
            crate::containers::refresh_site_routes(app, &updated.environment_id)
        } else {
            Ok(())
        }
    });
    if let Err(error) = save {
        if renamed {
            let _ = fs::rename(&new_directory, &old_directory);
        }
        let _ = crate::storage::save_site(
            app,
            &original.id,
            &original.environment_id,
            &original.domain,
            &serde_json::to_string(&original).unwrap_or_default(),
        );
        if routing_changed {
            let _ = crate::containers::refresh_site_routes(app, &original.environment_id);
        }
        return Err(format!(
            "Failed to update project; changes were rolled back. {error}"
        ));
    }
    sites[index] = updated;
    Ok(sites)
}

pub fn ensure_directories(app: &tauri::AppHandle, environment_id: &str) -> Result<(), String> {
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|item| item.id == environment_id)
        .ok_or("Environment not found")?;
    for site in list(app)?
        .into_iter()
        .filter(|site| site.environment_id == environment_id)
    {
        let directory = PathBuf::from(&site.directory);
        fs::create_dir_all(&directory).map_err(|error| {
            format!(
                "Failed to restore site directory {}: {error}",
                directory.display()
            )
        })?;
        if !directory.join("index.php").exists()
            && !directory.join("index.html").exists()
            && !directory.join("public/index.php").exists()
            && !directory.join("package.json").exists()
        {
            if site.project_type == "react" {
                write_react_starter(&directory, &site)?;
            } else if site.project_type == "node" {
                fs::write(directory.join("package.json"), format!("{{\"name\":{},\"private\":true,\"scripts\":{{\"start\":\"node server.js\"}}}}\n",serde_json::to_string(&site.name).map_err(|error|error.to_string())?)).map_err(|error|error.to_string())?;
                fs::write(directory.join("server.js"),"require('node:http').createServer((q,s)=>s.end('LS Panel Node.js site is running.')).listen(3000,'0.0.0');\n").map_err(|error|error.to_string())?;
                fs::write(
                    directory.join("index.html"),
                    "Node.js service is starting…\n",
                )
                .map_err(|error| error.to_string())?;
            } else if site.project_type == "static" {
                fs::write(
                    directory.join("index.html"),
                    format!(
                        "<!doctype html><title>{}</title><h1>{}</h1>\n",
                        site.name, site.name
                    ),
                )
                .map_err(|error| error.to_string())?;
            } else if site.project_type == "laravel" {
                fs::create_dir_all(directory.join("public")).map_err(|error| error.to_string())?;
                fs::write(
                    directory.join("public/index.php"),
                    "<?php echo 'Preparing Laravel…';\n",
                )
                .map_err(|error| error.to_string())?;
            } else {
                fs::write(
                    directory.join("index.php"),
                    default_php_index(&site, &environment),
                )
                .map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        domains_overlap, validate_local_alias, validate_local_domain, validate_project_name,
        write_react_starter, Site,
    };
    use std::fs;

    #[test]
    fn accepts_safe_localhost_domains_only() {
        assert!(validate_local_domain("demo.localhost").is_ok());
        assert!(validate_local_domain("api.demo.localhost").is_ok());
        assert!(validate_local_domain("demo.test").is_err());
        assert!(validate_local_domain("bad_name.localhost").is_err());
        assert!(validate_local_domain("-bad.localhost").is_err());
    }

    #[test]
    fn wildcard_aliases_are_safe_and_detect_route_conflicts() {
        assert!(validate_local_alias("*.demo.localhost").is_ok());
        assert!(validate_local_alias("*.localhost").is_err());
        assert!(validate_local_alias("api.demo.localhost").is_ok());
        assert!(domains_overlap("*.demo.localhost", "api.demo.localhost"));
        assert!(!domains_overlap(
            "*.demo.localhost",
            "deep.api.demo.localhost"
        ));
    }

    #[test]
    fn project_names_cannot_escape_the_sites_directory() {
        assert!(validate_project_name("demo_site-2").is_ok());
        assert!(validate_project_name("../outside").is_err());
        assert!(validate_project_name("nested/project").is_err());
        assert!(validate_project_name("").is_err());
    }

    #[test]
    fn legacy_sites_remain_enabled_after_deserialization() {
        let site: Site = serde_json::from_str(
            r#"{"id":"demo","name":"demo","domain":"demo.localhost","environmentId":"env-demo","directory":"/tmp/demo"}"#,
        )
        .unwrap();
        assert!(site.enabled);
    }

    #[test]
    fn creates_a_runnable_vite_react_starter() {
        let directory =
            std::env::temp_dir().join(format!("lspanel-react-starter-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let site = Site {
            id: "react-test".into(),
            name: "react-app".into(),
            domain: "react.localhost".into(),
            environment_id: "env-test".into(),
            directory: directory.display().to_string(),
            project_type: "react".into(),
            aliases: vec![],
            tags: vec![],
            group: String::new(),
            pinned: false,
            archived: false,
            enabled: true,
            auto_init_git: false,
            created_at: 0,
            last_started_at: None,
        };
        write_react_starter(&directory, &site).unwrap();
        let package = fs::read_to_string(directory.join("package.json")).unwrap();
        assert!(package.contains("\"react\": \"latest\""));
        assert!(package.contains("vite --host 0.0.0.0 --port 3000"));
        assert!(directory.join("src/main.jsx").is_file());
        let _ = fs::remove_dir_all(directory);
    }
}
