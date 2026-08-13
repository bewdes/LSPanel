use std::{
    collections::HashSet,
    ffi::OsString,
    fs,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use serde::Serialize;
use tauri::Emitter;

use crate::{containers::Environment, sites::Site};

const SYMFONY_INSTALL_COMMAND: &str = "APP_ENV=dev COMPOSER_MEMORY_LIMIT=-1 composer create-project --no-interaction symfony/skeleton . && APP_ENV=dev composer require --no-interaction webapp";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProvisionOutput {
    environment_id: String,
    line: String,
}

/// Shows the user exactly what LS Panel runs on their behalf while
/// scaffolding a project — the same `composer create-project`/wp-cli
/// commands (and, for the .env values it patches afterward, exactly which
/// keys) a person would run by hand from a terminal. Secrets are redacted
/// the same way any other environment output already is.
fn emit_provision_line(
    app: &tauri::AppHandle,
    environment_id: &str,
    line: &str,
    secrets: &[String],
) {
    let clean = crate::security::redact(line, secrets.iter().cloned());
    if clean.trim().is_empty() {
        return;
    }
    let _ = app.emit(
        "project-provision-output",
        ProvisionOutput {
            environment_id: environment_id.into(),
            line: clean,
        },
    );
}

pub fn is_node_project(project_type: &str) -> bool {
    matches!(project_type, "node" | "react")
}

pub fn normalize_environment(project_type: &str, environment: &mut Environment) {
    if project_type == "wordpress"
        && environment.database != "PostgreSQL"
        && !environment
            .php_extensions
            .iter()
            .any(|extension| extension == "mysqli")
    {
        environment.php_extensions.push("mysqli".into());
    }
    if project_type == "symfony" {
        let app_environment = environment
            .environment_variables
            .get("APP_ENV")
            .map(String::as_str);
        environment.environment_variables.insert(
            "APP_ENV".into(),
            if matches!(app_environment, Some("prod" | "production")) {
                "prod"
            } else {
                "dev"
            }
            .into(),
        );
    }
}

pub struct DirectoryBaseline {
    path: PathBuf,
    existed: bool,
    entries: HashSet<OsString>,
}

impl DirectoryBaseline {
    pub fn capture(path: &Path) -> Result<Self, String> {
        let existed = path.exists();
        let entries = if existed {
            fs::read_dir(path)
                .map_err(|error| format!("Failed to inspect project directory: {error}"))?
                .map(|entry| {
                    entry
                        .map(|entry| entry.file_name())
                        .map_err(|error| error.to_string())
                })
                .collect::<Result<HashSet<_>, _>>()?
        } else {
            HashSet::new()
        };
        Ok(Self {
            path: path.to_path_buf(),
            existed,
            entries,
        })
    }

    pub fn rollback(&self) -> Result<(), String> {
        if !self.path.exists() {
            if self.existed {
                fs::create_dir_all(&self.path)
                    .map_err(|error| format!("Failed to restore project directory: {error}"))?;
            }
            return Ok(());
        }
        if !self.existed {
            return fs::remove_dir_all(&self.path)
                .map_err(|error| format!("Failed to remove rolled-back project files: {error}"));
        }
        for entry in fs::read_dir(&self.path).map_err(|error| {
            format!("Failed to inspect project directory during rollback: {error}")
        })? {
            let entry = entry.map_err(|error| error.to_string())?;
            if self.entries.contains(&entry.file_name()) {
                continue;
            }
            let path = entry.path();
            let kind = entry
                .file_type()
                .map_err(|error| format!("Failed to inspect rollback entry: {error}"))?;
            if kind.is_dir() && !kind.is_symlink() {
                fs::remove_dir_all(&path)
            } else {
                fs::remove_file(&path)
            }
            .map_err(|error| {
                format!(
                    "Failed to remove {} during rollback: {error}",
                    path.display()
                )
            })?;
        }
        Ok(())
    }
}

pub fn import_project(source: &Path, destination: &Path) -> Result<String, String> {
    if !source.is_dir() {
        return Err("The selected import directory does not exist".into());
    }
    let destination_existed = destination.exists();
    if destination_existed
        && destination
            .read_dir()
            .map_err(|error| error.to_string())?
            .next()
            .is_some()
    {
        return Err("The destination project directory is not empty".into());
    }
    let source = source
        .canonicalize()
        .map_err(|error| format!("Failed to access import directory: {error}"))?;
    fs::create_dir_all(destination)
        .map_err(|error| format!("Failed to create destination directory: {error}"))?;
    let canonical_destination = destination
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if canonical_destination == source || canonical_destination.starts_with(&source) {
        if !destination_existed {
            let _ = fs::remove_dir_all(destination);
        }
        return Err("The import source cannot contain the destination directory".into());
    }
    if let Err(error) = copy_directory(&source, destination) {
        let _ = fs::remove_dir_all(destination);
        if destination_existed {
            let _ = fs::create_dir_all(destination);
        }
        return Err(error);
    }
    Ok(detect_project_type(destination))
}

pub fn clone_project(
    app: &tauri::AppHandle,
    environment_id: &str,
    repository: &str,
    destination: &Path,
) -> Result<String, String> {
    let repository = repository.trim();
    let valid = repository.starts_with("https://")
        || repository.starts_with("ssh://")
        || (repository.starts_with("git@") && repository.contains(':'));
    if !valid {
        return Err("Use an HTTPS or SSH Git repository URL".into());
    }
    if repository.starts_with("https://")
        && repository.split_once("://").is_some_and(|(_, tail)| {
            tail.split('/')
                .next()
                .is_some_and(|authority| authority.contains('@'))
        })
    {
        return Err("Repository URLs containing credentials are not allowed. Use your Git credential helper or SSH agent.".into());
    }
    if destination.exists()
        && destination
            .read_dir()
            .map_err(|error| error.to_string())?
            .next()
            .is_some()
    {
        return Err("The destination project directory is not empty".into());
    }
    let existed = destination.exists();
    let secrets = crate::security::environment_secrets(app, environment_id);
    emit_provision_line(
        app,
        environment_id,
        &format!("$ git clone -- {repository} {}", destination.display()),
        &secrets,
    );
    let mut command = Command::new("git");
    command
        .args(["clone", "--progress", "--", repository])
        .arg(destination)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let child = command
        .spawn()
        .map_err(|error| format!("Failed to launch Git clone: {error}"))?;
    let live_app = app.clone();
    let live_environment_id = environment_id.to_owned();
    let live_secrets = secrets.clone();
    let (status, _stdout_text, stderr_text) = crate::process::stream_lines(
        child,
        crate::process::GIT_CLONE_TIMEOUT,
        "Git clone",
        move |line| emit_provision_line(&live_app, &live_environment_id, line, &live_secrets),
    )
    .inspect_err(|_| {
        if !existed {
            let _ = fs::remove_dir_all(destination);
        }
    })?;
    if !status.success() {
        if !existed {
            let _ = fs::remove_dir_all(destination);
        }
        return Err(if stderr_text.trim().is_empty() {
            "Git clone failed".into()
        } else {
            stderr_text.trim().to_owned()
        });
    }
    Ok(detect_project_type(destination))
}

pub fn initialize_git(directory: &Path) -> Result<(), String> {
    if directory.join(".git").exists() {
        return Ok(());
    }
    let ignore = directory.join(".gitignore");
    if !ignore.exists() {
        fs::write(
            &ignore,
            ".env\n.env.*\n!.env.example\nnode_modules/\nvendor/\n.DS_Store\n*.log\n",
        )
        .map_err(|error| format!("Failed to create .gitignore: {error}"))?;
    }
    let output = crate::process::output(
        Command::new("git")
            .args(["init", "--initial-branch=main"])
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Git initialization",
    )?;
    if output.status.success() {
        Ok(())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr);
        Err(if detail.trim().is_empty() {
            "Git initialization failed".into()
        } else {
            detail.trim().into()
        })
    }
}

fn detect_project_type(directory: &Path) -> String {
    if directory.join("wp-content").is_dir() || directory.join("wp-config.php").is_file() {
        "wordpress"
    } else if directory.join("artisan").is_file() && directory.join("public/index.php").is_file() {
        "laravel"
    } else if directory.join("package.json").is_file() {
        "node"
    } else if directory.join("index.html").is_file() && !directory.join("index.php").is_file() {
        "static"
    } else {
        "php"
    }
    .into()
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    for entry in
        fs::read_dir(source).map_err(|error| format!("Failed to read import directory: {error}"))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let kind = entry.file_type().map_err(|error| error.to_string())?;
        let target = destination.join(entry.file_name());
        if kind.is_symlink() {
            continue;
        } else if kind.is_dir() {
            fs::create_dir_all(&target).map_err(|error| error.to_string())?;
            copy_directory(&entry.path(), &target)?
        } else if kind.is_file() {
            fs::copy(entry.path(), target)
                .map_err(|error| format!("Failed to copy project file: {error}"))?;
        }
    }
    Ok(())
}

pub fn copy_project(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_dir() {
        return Err("Source project directory does not exist".into());
    }
    if destination.exists() {
        return Err("Destination project directory already exists".into());
    }
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    if let Err(error) = copy_directory(source, destination) {
        let _ = fs::remove_dir_all(destination);
        return Err(error);
    }
    Ok(())
}

pub fn provision(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    // WordPress/Laravel/Symfony installation shells out to a PHP/database
    // container (`run_in_php`/`run_in_service`) — reachable only when
    // attaching one of these project types to an *existing* native
    // environment (the wizard's own "new environment" flow never offers
    // this combination), otherwise failing deep inside with a raw compose
    // error instead of an explained reason.
    if environment.runtime_mode == "native"
        && matches!(
            site.project_type.as_str(),
            "wordpress" | "laravel" | "symfony"
        )
    {
        return Err(
            "Native (containerless) environments don't support WordPress, Laravel, or Symfony installation — attach this project to a container environment instead.".into(),
        );
    }
    match site.project_type.as_str() {
        "wordpress" => provision_wordpress(app, site, environment),
        "laravel" => provision_laravel(app, site, environment),
        "symfony" => provision_symfony(app, site, environment),
        _ => Ok(()),
    }
}

pub fn configure_duplicate(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    match site.project_type.as_str() {
        "laravel" => configure_laravel_env(app, site, environment),
        "symfony" => configure_symfony_env(app, site, environment),
        "wordpress" => {
            let path = Path::new(&site.directory).join("app").join("wp-config.php");
            let mut contents = fs::read_to_string(&path)
                .map_err(|error| format!("Failed to read duplicated wp-config.php: {error}"))?;
            for (key, value) in [
                ("DB_NAME", environment.database_name.as_str()),
                ("DB_USER", environment.database_user.as_str()),
                ("DB_PASSWORD", environment.database_password.as_str()),
                ("DB_HOST", "database"),
                ("WP_HOME", &format!("https://{}", site.domain)),
                ("WP_SITEURL", &format!("https://{}", site.domain)),
            ] {
                contents = set_php_define(contents, key, value);
            }
            contents = ensure_wordpress_proxy_https(contents);
            fs::write(path, contents)
                .map_err(|error| format!("Failed to update duplicated wp-config.php: {error}"))
        }
        _ => Ok(()),
    }
}

/// Node.js environments hold exactly one `node_command`/service slot, so a
/// second Node project cannot be safely attached to an already-existing
/// environment without breaking whichever site already uses it.
pub fn supports_existing_environment(project_type: &str) -> bool {
    !is_node_project(project_type)
}

pub fn prepare_for_removal(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    if Path::new(&site.directory).is_dir() {
        repair_permissions(app, site, environment)?;
    }
    Ok(())
}

pub fn repair_permissions(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    restore_ownership(app, site, environment)
}

fn provision_wordpress(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    if environment.wordpress_site_title.trim().is_empty()
        || environment.wordpress_admin_user.trim().is_empty()
        || environment.wordpress_admin_password.chars().count() < 8
        || !environment.wordpress_admin_email.contains('@')
    {
        return Err(
            "Complete the WordPress administrator title, username, password and email".into(),
        );
    }
    crate::operations::progress_for_environment(app, &environment.id, 88, "Downloading WordPress")?;
    let app_directory = Path::new(&site.directory).join("app");
    fs::create_dir_all(&app_directory).map_err(|error| error.to_string())?;
    clear_directory(&app_directory)?;
    run_in_php(app, site, environment, "php -r '$d=file_get_contents(\"https://wordpress.org/latest.zip\"); if($d===false){exit(2);} file_put_contents(\"/tmp/lspanel-wordpress.zip\",$d); $z=new ZipArchive(); if($z->open(\"/tmp/lspanel-wordpress.zip\")!==true){exit(3);} $z->extractTo(\"/tmp/lspanel-wordpress\"); $z->close();' && cp -a /tmp/lspanel-wordpress/wordpress/. . && rm -rf /tmp/lspanel-wordpress /tmp/lspanel-wordpress.zip")?;
    crate::operations::progress_for_environment(
        app,
        &environment.id,
        96,
        "Configuring WordPress database",
    )?;
    restore_ownership(app, site, environment)?;
    let config = format!("<?php\n{}define('DB_NAME', {});\ndefine('DB_USER', {});\ndefine('DB_PASSWORD', {});\ndefine('DB_HOST', 'database');\ndefine('DB_CHARSET', 'utf8mb4');\ndefine('DB_COLLATE', '');\ndefine('WP_DEBUG', true);\ndefine('WP_HOME', 'https://{}');\ndefine('WP_SITEURL', 'https://{}');\n$table_prefix='wp_';\nif(!defined('ABSPATH')) define('ABSPATH', __DIR__.'/');\nrequire_once ABSPATH.'wp-settings.php';\n", wordpress_proxy_https_config(), php_string(&environment.database_name), php_string(&environment.database_user), php_string(&environment.database_password), site.domain, site.domain);
    fs::write(app_directory.join("wp-config.php"), config)
        .map_err(|error| format!("Failed to write wp-config.php: {error}"))?;
    crate::operations::progress_for_environment(
        app,
        &environment.id,
        97,
        "Installing WordPress database tables",
    )?;
    let install = format!(
        "php -r '$d=file_get_contents(\"https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar\"); if($d===false){{exit(2);}} file_put_contents(\"/tmp/lspanel-wp-cli.phar\",$d);' && (php /tmp/lspanel-wp-cli.phar core is-installed --allow-root || php /tmp/lspanel-wp-cli.phar core install --allow-root --url={} --title={} --admin_user={} --admin_password={} --admin_email={} --skip-email) && rm -f /tmp/lspanel-wp-cli.phar",
        crate::shell::shell_quote(&format!("https://{}", site.domain)),
        crate::shell::shell_quote(&environment.wordpress_site_title),
        crate::shell::shell_quote(&environment.wordpress_admin_user),
        crate::shell::shell_quote(&environment.wordpress_admin_password),
        crate::shell::shell_quote(&environment.wordpress_admin_email),
    );
    run_in_php(app, site, environment, &install)?;
    restore_ownership(app, site, environment)?;
    Ok(())
}

fn provision_laravel(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    crate::operations::progress_for_environment(
        app,
        &environment.id,
        88,
        "Installing Laravel with Composer",
    )?;
    clear_directory(&Path::new(&site.directory).join("app"))?;
    run_in_php(app, site, environment, "COMPOSER_MEMORY_LIMIT=-1 composer create-project --no-interaction --prefer-dist laravel/laravel .")?;
    restore_ownership(app, site, environment)?;
    crate::operations::progress_for_environment(
        app,
        &environment.id,
        96,
        "Configuring Laravel database",
    )?;
    configure_laravel_env(app, site, environment)
}

fn provision_symfony(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    crate::operations::progress_for_environment(
        app,
        &environment.id,
        88,
        "Installing Symfony with Composer",
    )?;
    clear_directory(&Path::new(&site.directory).join("app"))?;
    run_in_php(app, site, environment, SYMFONY_INSTALL_COMMAND)?;
    restore_ownership(app, site, environment)?;
    crate::operations::progress_for_environment(
        app,
        &environment.id,
        96,
        "Configuring Symfony database",
    )?;
    configure_symfony_env(app, site, environment)
}

fn configure_laravel_env(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    let env_path = Path::new(&site.directory).join("app").join(".env");
    let mut contents = fs::read_to_string(&env_path)
        .map_err(|error| format!("Failed to read Laravel .env: {error}"))?;
    let driver = if environment.database == "PostgreSQL" {
        "pgsql"
    } else {
        "mysql"
    };
    let values = [
        ("APP_URL", format!("https://{}", site.domain)),
        ("DB_CONNECTION", driver.into()),
        ("DB_HOST", "database".into()),
        (
            "DB_PORT",
            if driver == "pgsql" {
                "5432".into()
            } else {
                "3306".into()
            },
        ),
        ("DB_DATABASE", environment.database_name.clone()),
        ("DB_USERNAME", environment.database_user.clone()),
        ("DB_PASSWORD", environment.database_password.clone()),
    ];
    for (key, value) in &values {
        contents = set_env(contents, key, value);
    }
    fs::write(&env_path, contents)
        .map_err(|error| format!("Failed to update Laravel .env: {error}"))?;
    emit_env_summary(app, environment, &values);
    Ok(())
}

fn configure_symfony_env(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    let env_path = Path::new(&site.directory).join("app").join(".env");
    let mut contents = fs::read_to_string(&env_path)
        .map_err(|error| format!("Failed to read Symfony .env: {error}"))?;
    let url = if environment.database == "PostgreSQL" {
        format!(
            "postgresql://{}:{}@database:5432/{}?serverVersion=16&charset=utf8",
            environment.database_user, environment.database_password, environment.database_name
        )
    } else {
        format!(
            "mysql://{}:{}@database:3306/{}?serverVersion=8.0.32&charset=utf8mb4",
            environment.database_user, environment.database_password, environment.database_name
        )
    };
    let values = [("DATABASE_URL", url)];
    for (key, value) in &values {
        contents = set_env(contents, key, value);
    }
    fs::write(&env_path, contents)
        .map_err(|error| format!("Failed to update Symfony .env: {error}"))?;
    emit_env_summary(app, environment, &values);
    Ok(())
}

fn emit_env_summary(app: &tauri::AppHandle, environment: &Environment, values: &[(&str, String)]) {
    let secrets = crate::security::environment_secrets(app, &environment.id);
    let summary = values
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join(" ");
    emit_provision_line(
        app,
        &environment.id,
        &format!("# Updated app/.env: {summary}"),
        &secrets,
    );
}

fn run_in_php(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
    script: &str,
) -> Result<(), String> {
    let service = if environment.web_server == "Nginx" {
        "php"
    } else {
        "web"
    };
    run_in_service(app, site, environment, service, script)
}

fn run_in_service(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
    service: &str,
    script: &str,
) -> Result<(), String> {
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let status = crate::containers::detect_runtime(preferred.as_deref());
    let executable = status
        .runtime
        .filter(|_| status.running && status.compose_available)
        .ok_or(status.message)?;
    let workdir = format!("/var/www/sites/{}/app", site.name);
    let secrets = crate::security::environment_secrets(app, &environment.id);
    emit_provision_line(app, &environment.id, &format!("$ {script}"), &secrets);
    let mut command = crate::containers::runtime_command(&executable);
    command
        .args([
            "compose",
            "exec",
            "-T",
            "--workdir",
            &workdir,
            service,
            "sh",
            "-lc",
            script,
        ])
        .current_dir(crate::containers::stack_directory(app, &environment.id)?)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let child = command
        .spawn()
        .map_err(|error| format!("Failed to launch project template installer: {error}"))?;
    let live_app = app.clone();
    let live_environment_id = environment.id.clone();
    let live_secrets = secrets.clone();
    let (status, stdout_text, stderr_text) = crate::process::stream_lines(
        child,
        crate::process::INSTALL_TIMEOUT,
        "project template installer",
        move |line| emit_provision_line(&live_app, &live_environment_id, line, &live_secrets),
    )?;
    if status.success() {
        Ok(())
    } else {
        let detail = format!("{stdout_text}{stderr_text}");
        Err(detail.trim().to_owned())
    }
}

fn run_in_temporary_service(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
    service: &str,
    script: &str,
) -> Result<(), String> {
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let status = crate::containers::detect_runtime(preferred.as_deref());
    let executable = status
        .runtime
        .filter(|_| status.running && status.compose_available)
        .ok_or(status.message)?;
    let workdir = format!("/var/www/sites/{}/app", site.name);
    let output = crate::process::output(
        crate::containers::runtime_command(&executable)
            .args([
                "compose",
                "run",
                "--rm",
                "--no-deps",
                "--workdir",
                &workdir,
                service,
                "sh",
                "-lc",
                script,
            ])
            .current_dir(crate::containers::stack_directory(app, &environment.id)?)
            .stdin(Stdio::null()),
        crate::process::INSTALL_TIMEOUT,
        "temporary project file permission repair",
    )?;
    if output.status.success() {
        Ok(())
    } else {
        let detail = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        Err(detail.trim().to_owned())
    }
}

fn clear_directory(path: &Path) -> Result<(), String> {
    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        }
        .map_err(|error| format!("Failed to prepare project directory: {error}"))?;
    }
    Ok(())
}

fn restore_ownership(
    app: &tauri::AppHandle,
    site: &Site,
    environment: &Environment,
) -> Result<(), String> {
    // Native (containerless) projects are never touched by a container
    // process, so their files are already owned by the host user — nothing
    // to repair, and there's no compose stack to run the repair command in
    // anyway (attempting it fails outright with "no such file or directory").
    if environment.runtime_mode == "native" {
        return Ok(());
    }
    let settings = crate::settings::load(app)?.ok_or("Settings not found")?;
    let metadata = fs::metadata(&settings.sites_directory)
        .map_err(|error| format!("Failed to inspect sites directory ownership: {error}"))?;
    let preferred = Some(settings.runtime);
    let runtime = crate::containers::detect_runtime(preferred.as_deref())
        .runtime
        .unwrap_or_default();
    let docker_uses_podman = runtime == "docker"
        && Command::new("docker")
            .args(["context", "inspect", "--format", "{{json .Endpoints}}"])
            .output()
            .ok()
            .is_some_and(|output| String::from_utf8_lossy(&output.stdout).contains("podman"));
    let (uid, gid) = (metadata.uid(), metadata.gid());
    if (runtime == "podman" || docker_uses_podman) && podman_is_rootless() {
        // Rootless Podman remaps the container's UID/GID namespace, so a
        // `chown` run *inside* the container can't reliably land on the
        // host's actual UID/GID - that depends on the current subuid/subgid
        // mapping, which isn't necessarily "container UID 0 = host user"
        // (a custom --uidmap, or a non-default subuid range, breaks that
        // assumption). `podman unshare` runs in the same user namespace as
        // rootless containers and translates correctly regardless of the
        // mapping actually in use.
        let app_directory = Path::new(&site.directory).join("app");
        let output = Command::new("podman")
            .args(["unshare", "chown", "-R", &format!("{uid}:{gid}")])
            .arg(&app_directory)
            .output()
            .map_err(|error| error.to_string())?;
        return if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
        };
    }
    // Rootful Podman and Docker both see the same UID/GID namespace as the
    // host, so a plain in-container chown to the host directory's owner
    // works directly.
    let service = if is_node_project(&site.project_type) {
        "node"
    } else if environment.web_server == "Nginx" {
        "php"
    } else {
        "web"
    };
    let command = format!("chown -R {uid}:{gid} .");
    run_in_service(app, site, environment, service, &command)
        .or_else(|_| run_in_temporary_service(app, site, environment, service, &command))
}

fn podman_is_rootless() -> bool {
    Command::new("podman")
        .args(["info", "--format", "{{.Host.Security.Rootless}}"])
        .output()
        .ok()
        .is_some_and(|output| {
            output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true"
        })
}

fn php_string(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn wordpress_proxy_https_config() -> &'static str {
    "// Trust HTTPS terminated by the LS Panel local gateway.\nif (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strpos($_SERVER['HTTP_X_FORWARDED_PROTO'], 'https') !== false) {\n    $_SERVER['HTTPS'] = 'on';\n}\n"
}

fn ensure_wordpress_proxy_https(contents: String) -> String {
    if contents.contains("HTTP_X_FORWARDED_PROTO") {
        return contents;
    }
    if let Some(offset) = contents.find("<?php") {
        let insert_at = offset + "<?php".len();
        let mut updated = contents;
        updated.insert_str(insert_at, &format!("\n{}", wordpress_proxy_https_config()));
        updated
    } else {
        format!("<?php\n{}{}", wordpress_proxy_https_config(), contents)
    }
}

fn set_php_define(contents: String, key: &str, value: &str) -> String {
    let replacement = format!("define('{key}', {});", php_string(value));
    let prefix_single = format!("define('{key}',");
    let prefix_double = format!("define(\"{key}\",");
    let mut found = false;
    let mut lines = contents
        .lines()
        .map(|line| {
            let compact = line.trim_start().replace(' ', "");
            if compact.starts_with(&prefix_single) || compact.starts_with(&prefix_double) {
                found = true;
                replacement.clone()
            } else {
                line.to_owned()
            }
        })
        .collect::<Vec<_>>();
    if !found {
        lines.insert(1.min(lines.len()), replacement);
    }
    format!("{}\n", lines.join("\n"))
}
fn set_env(contents: String, key: &str, value: &str) -> String {
    let line = format!("{key}={value}");
    let mut found = false;
    let mut lines = contents
        .lines()
        .map(|current| {
            if current.starts_with(&format!("{key}=")) {
                found = true;
                line.clone()
            } else {
                current.to_owned()
            }
        })
        .collect::<Vec<_>>();
    if !found {
        lines.push(line)
    }
    format!("{}\n", lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::{
        detect_project_type, ensure_wordpress_proxy_https, import_project, is_node_project,
        set_env, set_php_define, supports_existing_environment, DirectoryBaseline,
        SYMFONY_INSTALL_COMMAND,
    };

    #[test]
    fn adds_wordpress_reverse_proxy_https_detection_once() {
        let config =
            ensure_wordpress_proxy_https("<?php\ndefine('DB_NAME', 'wordpress');\n".into());
        assert!(config.contains("HTTP_X_FORWARDED_PROTO"));
        let config = ensure_wordpress_proxy_https(config);
        assert_eq!(config.matches("HTTP_X_FORWARDED_PROTO").count(), 2);
    }
    use std::fs;

    #[test]
    fn detects_supported_imported_projects() {
        let root =
            std::env::temp_dir().join(format!("lspanel-template-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("wp-content")).unwrap();
        assert_eq!(detect_project_type(&root), "wordpress");
        fs::remove_dir_all(root.join("wp-content")).unwrap();
        fs::write(root.join("package.json"), "{}").unwrap();
        assert_eq!(detect_project_type(&root), "node");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_copies_source_files_directly_into_the_destination() {
        // Callers pass the site's `app/` folder as `destination`, so
        // `import_project` itself just copies and detects — the caller owns
        // deciding where `app/` lives relative to the project root.
        let base = std::env::temp_dir().join(format!("lspanel-import-copy-{}", std::process::id()));
        let source = base.join("source");
        let destination = base.join("destination/app");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("index.php"), "<?php echo 'hi';").unwrap();
        fs::write(source.join(".env"), "SECRET=1").unwrap();

        let project_type = import_project(&source, &destination).unwrap();

        assert_eq!(project_type, "php");
        assert!(destination.join("index.php").is_file());
        assert!(destination.join(".env").is_file());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn import_detects_a_laravel_project() {
        let base =
            std::env::temp_dir().join(format!("lspanel-import-laravel-{}", std::process::id()));
        let source = base.join("source");
        let destination = base.join("destination/app");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(source.join("public")).unwrap();
        fs::write(source.join("artisan"), "#!/usr/bin/env php").unwrap();
        fs::write(source.join("public/index.php"), "<?php").unwrap();

        let project_type = import_project(&source, &destination).unwrap();

        assert_eq!(project_type, "laravel");
        assert!(destination.join("public/index.php").is_file());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn only_node_is_excluded_from_existing_environment_reuse() {
        assert!(!supports_existing_environment("node"));
        assert!(!supports_existing_environment("react"));
        assert!(is_node_project("react"));
        for project_type in ["wordpress", "laravel", "import", "git", "php", "static"] {
            assert!(supports_existing_environment(project_type));
        }
    }

    #[test]
    fn symfony_install_uses_a_supported_environment_for_all_composer_scripts() {
        assert_eq!(SYMFONY_INSTALL_COMMAND.matches("APP_ENV=dev").count(), 2);
        assert!(!SYMFONY_INSTALL_COMMAND.contains("APP_ENV=development"));
    }

    #[test]
    fn directory_rollback_removes_new_project_and_preserves_existing_files() {
        let root =
            std::env::temp_dir().join(format!("lspanel-directory-rollback-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("keep.txt"), "user data").unwrap();
        let baseline = DirectoryBaseline::capture(&root).unwrap();
        fs::write(root.join("generated.txt"), "generated").unwrap();
        fs::create_dir(root.join("vendor")).unwrap();
        fs::write(root.join("vendor/package.php"), "generated").unwrap();

        baseline.rollback().unwrap();

        assert_eq!(
            fs::read_to_string(root.join("keep.txt")).unwrap(),
            "user data"
        );
        assert!(!root.join("generated.txt").exists());
        assert!(!root.join("vendor").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn directory_rollback_removes_directory_created_by_failed_operation() {
        let root = std::env::temp_dir().join(format!(
            "lspanel-new-directory-rollback-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let baseline = DirectoryBaseline::capture(&root).unwrap();
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("index.php"), "generated").unwrap();

        baseline.rollback().unwrap();

        assert!(!root.exists());
    }

    #[test]
    fn duplicated_framework_configuration_uses_new_domain_and_credentials() {
        let env = set_env(
            "APP_URL=http://old.localhost\nDB_PASSWORD=old\n".into(),
            "APP_URL",
            "https://new.localhost",
        );
        let env = set_env(env, "DB_PASSWORD", "new-secret");
        assert!(env.contains("APP_URL=https://new.localhost"));
        assert!(env.contains("DB_PASSWORD=new-secret"));
        assert!(!env.contains("DB_PASSWORD=old"));

        let php = set_php_define(
            "<?php\ndefine('DB_PASSWORD', 'old');\ndefine(\"WP_HOME\", 'http://old.localhost');\n"
                .into(),
            "DB_PASSWORD",
            "new'secret",
        );
        let php = set_php_define(php, "WP_HOME", "https://new.localhost");
        assert!(php.contains("define('DB_PASSWORD', 'new\\'secret');"));
        assert!(php.contains("define('WP_HOME', 'https://new.localhost');"));
        assert!(!php.contains("http://old.localhost"));
    }
}
