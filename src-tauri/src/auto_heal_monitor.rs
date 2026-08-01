use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const CHECK_INTERVAL: Duration = Duration::from_secs(5 * 60);
/// Never alert about the same environment more than once per hour, so a
/// container stuck crash-looping doesn't spam a notification every 5 minutes.
const RENOTIFY_INTERVAL_SECS: i64 = 60 * 60;

static LAST_ALERT: LazyLock<Mutex<HashMap<String, i64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn start(app: &tauri::AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        check(&app);
        std::thread::sleep(CHECK_INTERVAL);
    });
}

fn check(app: &tauri::AppHandle) {
    let settings = crate::settings::load(app)
        .ok()
        .flatten()
        .unwrap_or_default();
    if !settings.auto_heal_enabled {
        return;
    }
    let Ok(environments) = crate::containers::list(app) else {
        return;
    };
    let Ok(sites) = crate::sites::list(app) else {
        return;
    };
    for environment in &environments {
        // Native (containerless) processes are outside compose's health model.
        if environment.runtime_mode == "native" {
            continue;
        }
        let has_enabled_site = sites
            .iter()
            .any(|site| site.environment_id == environment.id && site.enabled);
        if !has_enabled_site {
            // The user deliberately stopped this project; not a crash to heal.
            continue;
        }
        let Some(problem_services) = unhealthy_services(app, &environment.id) else {
            continue;
        };
        if problem_services.is_empty() || !should_notify(&environment.id) {
            continue;
        }
        // Docker/Podman's own restart policy already relaunches crashed
        // containers for "always" / "unless-stopped" / "on-failure". Only
        // "no" leaves a crashed container down forever, so that's the one
        // case where LS Panel needs to step in itself.
        if environment.restart_policy == "no" {
            let _ = crate::containers::operate(app, &environment.id, "start");
        }
        notify(app, &settings, &environment.name, &problem_services);
    }
}

/// Returns the names of services that are down or reporting unhealthy, or
/// `None` when the stack's state could not be read at all (runtime
/// unavailable, not yet provisioned) — callers should treat `None` as "can't
/// tell" rather than "healthy".
fn unhealthy_services(app: &tauri::AppHandle, id: &str) -> Option<Vec<String>> {
    let preferred = crate::settings::load(app).ok().flatten().map(|s| s.runtime);
    let status = crate::containers::detect_runtime(preferred.as_deref());
    let executable = status
        .runtime
        .filter(|_| status.running && status.compose_available)?;
    let directory = crate::containers::stack_directory(app, id).ok()?;
    if !directory.join("compose.yaml").exists() {
        return None;
    }
    let output = crate::containers::runtime_command(&executable)
        .args(["compose", "ps", "--all", "--format", "json"])
        .current_dir(&directory)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let services =
        crate::container_inspection::parse_services(&String::from_utf8_lossy(&output.stdout));
    if services.is_empty() {
        return None;
    }
    Some(
        services
            .into_iter()
            .filter(|service| {
                matches!(service.state.as_str(), "exited" | "dead") || service.health == "unhealthy"
            })
            .map(|service| service.name)
            .collect(),
    )
}

fn should_notify(environment_id: &str) -> bool {
    let now = now_secs();
    let mut last_alert = LAST_ALERT.lock().unwrap_or_else(|error| error.into_inner());
    match last_alert.get(environment_id) {
        Some(&last) if now - last < RENOTIFY_INTERVAL_SECS => false,
        _ => {
            last_alert.insert(environment_id.to_string(), now);
            true
        }
    }
}

fn notify(
    app: &tauri::AppHandle,
    settings: &crate::settings::AppSettings,
    environment_name: &str,
    problem_services: &[String],
) {
    let uk = settings.language == "uk";
    let services_list = problem_services.join(", ");
    let body = if uk {
        format!("Середовище «{environment_name}»: проблема із сервісами ({services_list})")
    } else {
        format!("Environment \"{environment_name}\": service issue ({services_list})")
    };
    crate::notifications::send(app, "auto-heal", "LS Panel", &body);
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
