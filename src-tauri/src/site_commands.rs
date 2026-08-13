use crate::{
    app_error, backups, containers, environment_files, notifications, operations,
    project_templates, security, settings, sites, storage,
};
use tauri::Emitter;

#[tauri::command]
pub fn list_sites(app: tauri::AppHandle) -> Result<Vec<sites::Site>, String> {
    sites::list(&app)
}

#[tauri::command]
pub fn create_site(app: tauri::AppHandle, site: sites::Site) -> Result<Vec<sites::Site>, String> {
    let operation = operations::create(&app, Some(&site.environment_id), "create-site")?;
    let result = sites::create(&app, site);
    match &result {
        Ok(_) => operations::complete(&app, &operation.id)?,
        Err(error) => operations::fail(&app, &operation.id, error)?,
    }
    result
}

#[tauri::command]
pub async fn operate_site(
    app: tauri::AppHandle,
    id: String,
    action: String,
) -> Result<Vec<sites::Site>, app_error::AppError> {
    if !matches!(action.as_str(), "start" | "stop") {
        return Err(app_error::AppError::from("Unsupported site action"));
    }
    let site = sites::list(&app)?
        .into_iter()
        .find(|site| site.id == id)
        .ok_or_else(|| app_error::AppError::from("Site not found"))?;
    let operation =
        operations::create(&app, Some(&site.environment_id), &format!("{action}-site"))?;
    let operation_id = operation.id.clone();
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        operations::progress_for_environment(
            &worker,
            &site.environment_id,
            10,
            &format!(
                "{} site {}",
                if action == "start" {
                    "Starting"
                } else {
                    "Stopping"
                },
                site.name
            ),
        )?;
        if action == "start" {
            let environment_was_running =
                containers::environment_status(&worker, &site.environment_id)
                    .map(|state| state.status == "running")
                    .unwrap_or(false);
            if !environment_was_running {
                // A stopped shared stack has no per-site runtime state. Reset
                // stale flags first so starting one card cannot revive every
                // route that happened to be active before the stack stopped.
                sites::set_environment_enabled(&worker, &site.environment_id, false)?;
            }
            sites::set_enabled(&worker, &site.id, true)?;
            if let Err(error) = containers::operate(&worker, &site.environment_id, "start") {
                let _ = sites::set_enabled(&worker, &site.id, false);
                return Err(error);
            }
        } else {
            sites::set_enabled(&worker, &site.id, false)?;
            let has_enabled_siblings = sites::list(&worker)?
                .iter()
                .any(|item| item.environment_id == site.environment_id && item.enabled);
            if !has_enabled_siblings {
                containers::operate(&worker, &site.environment_id, "stop")?;
            }
        }
        operations::progress_for_environment(
            &worker,
            &site.environment_id,
            95,
            "Refreshing local routes",
        )?;
        containers::refresh_gateway(&worker)?;
        sites::list(&worker)
    })
    .await
    .map_err(|error| format!("Site operation failed: {error}"))
    .and_then(|result| result);
    match &result {
        Ok(_) => operations::complete(&app, &operation_id)?,
        Err(error) => operations::fail(&app, &operation_id, error)?,
    }
    result.map_err(|error| app_error::AppError::with_operation(error, operation_id))
}

fn rollback_directory_error(
    baseline: &project_templates::DirectoryBaseline,
    original: String,
) -> String {
    match baseline.rollback() {
        Ok(()) => original,
        Err(rollback) => format!("{original} Directory rollback also failed: {rollback}"),
    }
}

fn rollback_created_project(
    app: &tauri::AppHandle,
    project: &sites::Site,
    environment: &containers::Environment,
    baseline: &project_templates::DirectoryBaseline,
    original: String,
) -> String {
    let _ = project_templates::prepare_for_removal(app, project, environment);
    let _ = containers::operate(app, &environment.id, "destroy");
    let _ = storage::delete_site(app, &project.id);
    let _ = containers::delete(app, &environment.id, true);
    let _ = containers::refresh_gateway(app);
    rollback_directory_error(baseline, original)
}

#[tauri::command]
pub async fn create_project_environment(
    app: tauri::AppHandle,
    site: sites::Site,
    environment: containers::Environment,
) -> Result<Vec<sites::Site>, app_error::AppError> {
    let creation_secrets = security::configured_secrets(&environment);
    let operation = operations::create(&app, Some(&environment.id), "create-project")?;
    let operation_id = operation.id.clone();
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut environment = environment;
        let mut site = site;
        let settings = settings::load(&worker)?.ok_or("Settings not found")?;
        let project_directory = std::path::PathBuf::from(settings.sites_directory).join(&site.name);
        let app_directory = project_directory.join("app");
        let directory_baseline = project_templates::DirectoryBaseline::capture(&project_directory)?;
        let external = matches!(site.project_type.as_str(), "import" | "git");
        if site.project_type == "import" {
            operations::progress_for_environment(
                &worker,
                &environment.id,
                3,
                "Copying and inspecting project files",
            )?;
            let source = std::path::PathBuf::from(&site.directory);
            site.project_type = project_templates::import_project(&source, &app_directory)?;
        } else if site.project_type == "git" {
            operations::progress_for_environment(
                &worker,
                &environment.id,
                3,
                "Cloning and inspecting Git repository",
            )?;
            let repository = site.directory.clone();
            site.project_type = project_templates::clone_project(&repository, &app_directory)?;
        } else if matches!(
            site.project_type.as_str(),
            "wordpress" | "laravel" | "symfony" | "node" | "react"
        ) && app_directory.exists()
            && app_directory
                .read_dir()
                .map_err(|error| error.to_string())?
                .next()
                .is_some()
        {
            return Err("Template installation requires an empty project directory".into());
        }
        if project_templates::is_node_project(&site.project_type) {
            if !environment
                .extra_services
                .iter()
                .any(|service| service == "node")
            {
                environment.extra_services.push("node".into());
            }
            environment.node_command = "npm start".into();
            environment.node_auto_install = true;
        }
        project_templates::normalize_environment(&site.project_type, &mut environment);
        operations::progress_for_environment(
            &worker,
            &environment.id,
            5,
            "Saving container environment",
        )?;
        if let Err(error) = containers::save(&worker, environment.clone()) {
            return Err(rollback_directory_error(&directory_baseline, error));
        }
        operations::progress_for_environment(
            &worker,
            &environment.id,
            15,
            "Creating project files and local route",
        )?;
        let project_id = site.id.clone();
        let created = match sites::create(&worker, site) {
            Ok(value) => value,
            Err(error) => {
                let _ = containers::delete(&worker, &environment.id, true);
                return Err(rollback_directory_error(&directory_baseline, error));
            }
        };
        let project = created
            .iter()
            .find(|item| item.id == project_id)
            .cloned()
            .ok_or("Created project was not found")?;
        if let Err(error) =
            containers::operate_for_provisioning(&worker, &environment.id, "rebuild")
        {
            return Err(rollback_created_project(
                &worker,
                &project,
                &environment,
                &directory_baseline,
                format!("Project build failed and was rolled back. {error}"),
            ));
        }
        // The wizard's "SQL dump" field is stored as an environment variable
        // rather than a dedicated field (mirroring LS_PANEL_AUTO_CREATE_DATABASE
        // above); import it into the freshly created database now, once,
        // rather than on every later start/restart. Container-only, same as
        // the gateway/native split below — there's no database container to
        // exec into for a native-mode environment.
        let sql_dump = environment
            .environment_variables
            .get("LS_PANEL_SQL_DUMP")
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        if let (Some(dump_path), false) = (sql_dump, environment.runtime_mode == "native") {
            operations::progress_for_environment(
                &worker,
                &environment.id,
                87,
                "Importing SQL dump",
            )?;
            if let Err(error) = crate::backups::import_sql_file(
                &worker,
                &environment.id,
                std::path::Path::new(&dump_path),
            ) {
                return Err(rollback_created_project(
                    &worker,
                    &project,
                    &environment,
                    &directory_baseline,
                    format!("SQL dump import failed and the project was rolled back. {error}"),
                ));
            }
        }
        if !external {
            if let Err(error) = project_templates::provision(&worker, &project, &environment) {
                return Err(rollback_created_project(
                    &worker,
                    &project,
                    &environment,
                    &directory_baseline,
                    format!("Project installation failed and was rolled back. {error}"),
                ));
            }
        }
        if environment.runtime_mode != "native" {
            operations::progress_for_environment(
                &worker,
                &environment.id,
                96,
                "Refreshing the local gateway",
            )?;
            if let Err(error) = containers::refresh_gateway(&worker) {
                return Err(rollback_created_project(
                    &worker,
                    &project,
                    &environment,
                    &directory_baseline,
                    format!("Local gateway refresh failed and was rolled back. {error}"),
                ));
            }
            operations::progress_for_environment(
                &worker,
                &environment.id,
                97,
                "Checking installed project route",
            )?;
            if let Err(error) = containers::verify_environment_sites(&worker, &environment.id) {
                return Err(rollback_created_project(
                    &worker,
                    &project,
                    &environment,
                    &directory_baseline,
                    format!("Installed project route check failed and was rolled back. {error}"),
                ));
            }
        }
        if project.auto_init_git {
            operations::progress_for_environment(
                &worker,
                &environment.id,
                98,
                "Initializing Git repository",
            )?;
            if let Err(error) = project_templates::initialize_git(&app_directory) {
                return Err(rollback_created_project(
                    &worker,
                    &project,
                    &environment,
                    &directory_baseline,
                    format!(
                        "Git initialization failed and project creation was rolled back. {error}"
                    ),
                ));
            }
        }
        Ok(created)
    })
    .await
    .map_err(|error| error.to_string())?;
    let result = result.map_err(|error| security::redact(&error, creation_secrets));
    match &result {
        Ok(_) => {
            operations::complete(&app, &operation_id)?;
            let _ = app.emit("environments-changed", ());
        }
        Err(error) => operations::fail(&app, &operation_id, error)?,
    }
    app_error::AppError::operation_result(result, operation_id)
}

#[tauri::command]
pub async fn provision_site_in_environment(
    app: tauri::AppHandle,
    site: sites::Site,
) -> Result<Vec<sites::Site>, app_error::AppError> {
    if !project_templates::supports_existing_environment(&site.project_type) {
        return Err("Node.js projects require a dedicated environment.".into());
    }
    // Mirrors `create_project_environment`'s own redaction: a provisioning
    // failure here (e.g. a WordPress wp-cli command embedding
    // `--admin_password=...`, or a database config error) must not leak the
    // environment's generated secrets into the error shown to the user.
    let creation_secrets = containers::list(&app)?
        .into_iter()
        .find(|item| item.id == site.environment_id)
        .map(|environment| security::configured_secrets(&environment))
        .unwrap_or_default();
    let operation = operations::create(&app, Some(&site.environment_id), "provision-site")?;
    let operation_id = operation.id.clone();
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut site = site;
        let environment_id = site.environment_id.clone();
        let environment = containers::list(&worker)?
            .into_iter()
            .find(|item| item.id == environment_id)
            .ok_or("Selected environment does not exist")?;
        let settings = settings::load(&worker)?.ok_or("Settings not found")?;
        let project_directory = std::path::PathBuf::from(settings.sites_directory).join(&site.name);
        let app_directory = project_directory.join("app");
        let directory_baseline = project_templates::DirectoryBaseline::capture(&project_directory)?;
        let external = matches!(site.project_type.as_str(), "import" | "git");

        if site.project_type == "import" {
            operations::progress_for_environment(
                &worker,
                &environment_id,
                10,
                "Copying and inspecting project files",
            )?;
            let source = std::path::PathBuf::from(&site.directory);
            site.project_type = project_templates::import_project(&source, &app_directory)?;
        } else if site.project_type == "git" {
            operations::progress_for_environment(
                &worker,
                &environment_id,
                10,
                "Cloning and inspecting Git repository",
            )?;
            let repository = site.directory.clone();
            site.project_type = project_templates::clone_project(&repository, &app_directory)?;
        } else if matches!(
            site.project_type.as_str(),
            "wordpress" | "laravel" | "symfony" | "react"
        ) && app_directory.exists()
            && app_directory
                .read_dir()
                .map_err(|error| error.to_string())?
                .next()
                .is_some()
        {
            return Err("Template installation requires an empty project directory".into());
        }

        operations::progress_for_environment(&worker, &environment_id, 30, "Registering site")?;
        let created = sites::create(&worker, site.clone())
            .map_err(|error| rollback_directory_error(&directory_baseline, error))?;
        let project = created
            .iter()
            .find(|item| item.id == site.id)
            .cloned()
            .ok_or("Created project was not found")?;

        operations::progress_for_environment(
            &worker,
            &environment_id,
            50,
            "Starting container environment",
        )?;
        if let Err(error) = containers::operate(&worker, &environment_id, "start") {
            let _ = sites::delete(&worker, &project.id, false);
            return Err(rollback_directory_error(
                &directory_baseline,
                format!("Environment failed to start. {error}"),
            ));
        }

        if !external {
            if let Err(error) = project_templates::provision(&worker, &project, &environment) {
                let _ = project_templates::prepare_for_removal(&worker, &project, &environment);
                let _ = sites::delete(&worker, &project.id, false);
                return Err(rollback_directory_error(
                    &directory_baseline,
                    format!("Project installation failed and was rolled back. {error}"),
                ));
            }
        }

        if project.auto_init_git {
            operations::progress_for_environment(
                &worker,
                &environment_id,
                98,
                "Initializing Git repository",
            )?;
            if let Err(error) = project_templates::initialize_git(&app_directory) {
                let _ = sites::delete(&worker, &project.id, false);
                return Err(rollback_directory_error(
                    &directory_baseline,
                    format!("Git initialization failed and site creation was rolled back. {error}"),
                ));
            }
        }
        Ok(created)
    })
    .await
    .map_err(|error| error.to_string())?;
    let result = result.map_err(|error| security::redact(&error, creation_secrets));

    match &result {
        Ok(_) => operations::complete(&app, &operation_id)?,
        Err(error) => operations::fail(&app, &operation_id, error)?,
    }
    app_error::AppError::operation_result(result, operation_id)
}

#[tauri::command]
pub async fn delete_site(
    app: tauri::AppHandle,
    id: String,
    delete_files: bool,
) -> Result<Vec<sites::Site>, app_error::AppError> {
    let environment_id = sites::list(&app)?
        .into_iter()
        .find(|site| site.id == id)
        .map(|site| site.environment_id);
    let operation = operations::create(&app, environment_id.as_deref(), "delete-site")?;
    let operation_id = operation.id.clone();
    let worker = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || sites::delete(&worker, &id, delete_files))
            .await
            .map_err(|error| error.to_string())?;
    match &result {
        Ok(_) => operations::complete(&app, &operation_id)?,
        Err(error) => operations::fail(&app, &operation_id, error)?,
    }
    app_error::AppError::operation_result(result, operation_id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn update_site(
    app: tauri::AppHandle,
    id: String,
    name: String,
    domain: String,
    pinned: bool,
    archived: bool,
    group: String,
    tags: Vec<String>,
    aliases: Vec<String>,
) -> Result<Vec<sites::Site>, String> {
    let worker = app.clone();
    let notify_name = name.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        sites::update(
            &worker, &id, &name, &domain, pinned, archived, &group, tags, aliases,
        )
    })
    .await
    .map_err(|error| error.to_string())?;
    if result.is_ok() {
        notifications::send_localized(
            &app,
            "site-update",
            &format!("Проєкт «{notify_name}» оновлено"),
            &format!("Project \"{notify_name}\" updated"),
        );
    }
    result
}

#[tauri::command]
pub async fn duplicate_site(
    app: tauri::AppHandle,
    id: String,
    name: String,
    domain: String,
) -> Result<Vec<sites::Site>, app_error::AppError> {
    let name = name.trim().to_owned();
    sites::validate_project_name(&name)?;
    let domain = domain
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches('/')
        .to_owned();
    sites::validate_local_domain(&domain)?;
    let existing_sites = sites::list(&app)?;
    if existing_sites.iter().any(|site| {
        site.name == name
            || site.domain == domain
            || site.aliases.iter().any(|alias| alias == &domain)
    }) {
        return Err("A project with this name, domain or alias already exists".into());
    }
    let source_site = existing_sites
        .into_iter()
        .find(|site| site.id == id)
        .ok_or("Site not found")?;
    let source_environment = containers::list(&app)?
        .into_iter()
        .find(|environment| environment.id == source_site.environment_id)
        .ok_or("Environment not found")?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let environment_id = format!("env-{timestamp}");
    let operation = operations::create(&app, Some(&environment_id), "duplicate-project")?;
    let operation_id = operation.id.clone();
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let settings = settings::load(&worker)?.ok_or("Settings not found")?;
        let destination = std::path::PathBuf::from(settings.sites_directory).join(&name);
        let baseline = project_templates::DirectoryBaseline::capture(&destination)?;
        let mut environment_saved = false;
        let mut source_backup_id: Option<String> = None;
        let mut target_backup_id: Option<String> = None;
        let attempt: Result<Vec<sites::Site>, String> = (|| {
            operations::progress_for_environment(
                &worker,
                &environment_id,
                5,
                "Copying project files",
            )?;
            project_templates::copy_project(
                std::path::Path::new(&source_site.directory),
                &destination,
            )?;
            let mut environment = source_environment.clone();
            environment.id = environment_id.clone();
            environment.name = format!("{}-copy-{timestamp}", source_environment.name);
            environment.web_container_name.clear();
            environment.database_container_name.clear();
            environment.database_password = environment_files::generate_secret(32)?;
            environment.database_root_password = environment_files::generate_secret(32)?;
            let mut site = source_site.clone();
            site.id = format!("site-{timestamp}");
            site.name = name.clone();
            site.domain = domain.clone();
            site.environment_id = environment_id.clone();
            site.directory = String::new();
            site.pinned = false;
            site.archived = false;
            let duplicate_site_id = site.id.clone();
            operations::progress_for_environment(
                &worker,
                &environment_id,
                20,
                "Saving duplicated environment",
            )?;
            containers::save(&worker, environment.clone())?;
            environment_saved = true;
            let created = sites::create(&worker, site)?;
            containers::operate(&worker, &environment_id, "rebuild")?;
            operations::progress_for_environment(&worker, &environment_id, 90, "Copying database")?;
            let backup = backups::create(&worker, &source_site.environment_id)?;
            source_backup_id = Some(backup.id.clone());
            let backup_id = backups::copy_to_environment(&worker, &backup, &environment_id)?;
            target_backup_id = Some(backup_id.clone());
            backups::restore(&worker, &environment_id, &backup_id)
                .map_err(|error| format!("Database copy failed: {error}"))?;
            let duplicated_site = created
                .iter()
                .find(|site| site.id == duplicate_site_id)
                .ok_or("Duplicated project was not found")?;
            project_templates::configure_duplicate(&worker, duplicated_site, &environment)?;
            Ok(created)
        })();

        if let Err(error) = &attempt {
            let error = security::environment_error(&worker, &environment_id, error);
            let mut rollback_errors = Vec::new();
            if let Some(backup_id) = &target_backup_id {
                if let Err(cleanup) = backups::delete(&worker, &environment_id, backup_id) {
                    rollback_errors.push(format!("target backup: {cleanup}"));
                }
            }
            if environment_saved {
                if let Err(cleanup) = containers::operate(&worker, &environment_id, "destroy") {
                    rollback_errors.push(format!("containers: {cleanup}"));
                }
                // `false`: the project directory is handled by baseline.rollback()
                // right below - letting containers::delete's own file cleanup run
                // too would have both mechanisms racing to rename/remove the same
                // directory.
                if let Err(cleanup) = containers::delete(&worker, &environment_id, false) {
                    rollback_errors.push(format!("environment record: {cleanup}"));
                }
            }
            if let Err(cleanup) = baseline.rollback() {
                rollback_errors.push(format!("project directory: {cleanup}"));
            }
            if let Some(backup_id) = &source_backup_id {
                if let Err(cleanup) =
                    backups::delete(&worker, &source_site.environment_id, backup_id)
                {
                    rollback_errors.push(format!("source backup: {cleanup}"));
                }
            }
            return Err(if rollback_errors.is_empty() {
                format!("Project duplication failed and was rolled back. {error}")
            } else {
                format!(
                    "Project duplication failed: {error}. Rollback also failed for: {}",
                    rollback_errors.join("; ")
                )
            });
        }

        if let Some(backup_id) = &target_backup_id {
            let _ = backups::delete(&worker, &environment_id, backup_id);
        }
        if let Some(backup_id) = &source_backup_id {
            let _ = backups::delete(&worker, &source_site.environment_id, backup_id);
        }
        attempt
    })
    .await
    .map_err(|error| error.to_string())?;
    match &result {
        Ok(_) => operations::complete(&app, &operation_id)?,
        Err(error) => operations::fail(&app, &operation_id, error)?,
    }
    app_error::AppError::operation_result(result, operation_id)
}

#[tauri::command]
pub async fn repair_site_permissions(
    app: tauri::AppHandle,
    id: String,
) -> Result<(), app_error::AppError> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let site = sites::list(&app)?
            .into_iter()
            .find(|site| site.id == id)
            .ok_or("Site not found")?;
        let environment = containers::list(&app)?
            .into_iter()
            .find(|environment| environment.id == site.environment_id)
            .ok_or("Environment not found")?;
        project_templates::repair_permissions(&app, &site, &environment)
    })
    .await
    .map_err(|error| app_error::AppError::from(error.to_string()))?;
    result.map_err(Into::into)
}
