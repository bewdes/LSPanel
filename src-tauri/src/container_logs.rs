use std::process::{Child, Stdio};

pub struct LogProcess {
    pub child: Child,
    pub secrets: Vec<String>,
}

pub fn spawn(
    app: &tauri::AppHandle,
    id: &str,
    service: Option<&str>,
) -> Result<LogProcess, String> {
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
    if service.is_some_and(|value| !SERVICES.contains(&value)) {
        return Err("Unsupported log service".into());
    }
    crate::containers::list(app)?
        .into_iter()
        .find(|value| value.id == id)
        .ok_or("Environment not found")?;
    let directory = crate::containers::stack_directory(app, id)?;
    if !directory.join("compose.yaml").exists() {
        return Err("The environment has not been built yet".into());
    }
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = crate::containers::detect_runtime(preferred.as_deref());
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or(runtime.message)?;
    let mut args = vec![
        "compose",
        "logs",
        "--follow",
        "--no-color",
        "--timestamps",
        "--tail",
        "200",
    ];
    if let Some(service) = service {
        args.push(service);
    }
    let child = crate::containers::runtime_command(&executable)
        .args(args)
        .current_dir(directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(LogProcess {
        child,
        secrets: crate::security::environment_secrets(app, id),
    })
}
