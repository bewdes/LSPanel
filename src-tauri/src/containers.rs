use serde::Serialize;
use std::{
    fs,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    process::Stdio,
};
use tauri::Manager;

pub(crate) use crate::container_bootstrap::database_charset;
use crate::container_bootstrap::ensure_database;
use crate::container_compose::{compose, php_dockerfile, site_document_root, site_hostnames};
use crate::container_gateway::{ensure_gateway, ensure_network};
pub(crate) use crate::container_gateway::{
    refresh_gateway, remove_gateway, verify_environment_sites,
};
use crate::container_inspection::{
    apply_stats as apply_service_stats, parse_services as parse_service_inspections,
};
pub use crate::container_inspection::{EnvironmentInspection, EnvironmentState, ServiceInspection};
use crate::container_lifecycle::{emit_progress, pull_images, run_compose};
pub use crate::container_logs::{environment_logs, LogProcess};
use crate::container_routes::service_hostname;
pub(crate) use crate::container_runtime::command as runtime_command;
pub use crate::container_runtime::{
    detect as detect_runtime, detect_each as detect_runtimes, RuntimeStatus,
};
pub use crate::container_schema::{Environment, EnvironmentOperation};
use crate::container_validation::{safe_resource_id, validate};

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

pub fn delete(
    app: &tauri::AppHandle,
    id: &str,
    delete_files: bool,
) -> Result<Vec<Environment>, String> {
    if !safe_resource_id(id) {
        return Err("Invalid environment identifier".into());
    }
    let sites = crate::sites::list(app)?
        .into_iter()
        .filter(|site| site.environment_id == id)
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
    // `storage::delete_environment` already cascades away the DB rows for
    // these sites, but their `.env` profile and project directory on disk
    // are not tracked by anything else once that happens — clean them up
    // here or they become permanently unreachable through the UI.
    for site in sites {
        if let Err(error) = crate::snapshots::delete_all(app, &site.id) {
            cleanup_errors.push(format!("snapshots for {}: {error}", site.id));
        }
        if let Err(error) = crate::environment_files::remove(app, &site.id) {
            cleanup_errors.push(format!("env file for {}: {error}", site.id));
        }
        if !delete_files {
            continue;
        }
        let directory = PathBuf::from(&site.directory);
        if directory.exists() {
            let parent = directory.parent();
            let quarantine = parent.map(|parent| {
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();
                parent.join(format!(".lspanel-delete-{timestamp}"))
            });
            match quarantine {
                Some(quarantine) => {
                    if let Err(error) = fs::rename(&directory, quarantine) {
                        cleanup_errors.push(format!("project files for {}: {error}", site.id));
                    }
                }
                None => {
                    cleanup_errors.push(format!(
                        "project files for {}: directory has no parent",
                        site.id
                    ));
                }
            }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::container_routes::{
        https_proxy_block, status_is_available as route_status_is_available,
    };
    use std::collections::BTreeMap;

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
}
