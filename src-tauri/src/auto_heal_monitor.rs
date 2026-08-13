use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const CHECK_INTERVAL: Duration = Duration::from_secs(5 * 60);
/// Never alert about the same environment more than once per hour, so a
/// container stuck crash-looping doesn't spam a notification every 5 minutes.
const RENOTIFY_INTERVAL_SECS: i64 = 60 * 60;
/// Delay before the very first check. Unlike auto-stop (which only acts
/// after an environment has been observed idle continuously for its full
/// threshold), this monitor acts on a single point-in-time read - so
/// checking immediately on launch would catch an environment that's simply
/// still in the middle of starting up (containers created but not yet
/// healthy) and misread that as a crash, restarting it and firing an
/// alarming "service issue" notification for something that was never
/// actually broken.
const STARTUP_GRACE: Duration = Duration::from_secs(90);
/// A service that's merely still starting up (its compose stack was just
/// (re)created, or its healthcheck hasn't had time to pass yet) can briefly
/// read as "exited"/"not running" or "unhealthy" - indistinguishable from a
/// genuine crash in a single point-in-time read. This delay applies only to
/// an environment that already looked like it had a problem on the first
/// read, so it doesn't slow down the common case of everything being fine.
const CONFIRM_DELAY: Duration = Duration::from_secs(30);

static LAST_ALERT: LazyLock<Mutex<HashMap<String, i64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn start(app: &tauri::AppHandle) {
    crate::monitor::run_periodic(app, CHECK_INTERVAL, STARTUP_GRACE, check);
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
        if problem_services.is_empty() {
            continue;
        }
        std::thread::sleep(CONFIRM_DELAY);
        let Some(problem_services) = unhealthy_services(app, &environment.id) else {
            continue;
        };
        if problem_services.is_empty() || !should_notify(&environment.id) {
            continue;
        }
        if let Some(action) = heal_action(&problem_services, &environment.restart_policy) {
            // Something else (a user action, or another monitor tick that's
            // still running) is already actively operating on this
            // environment — the "unhealthy" read that got us here is very
            // likely just that operation's own transient state, not a
            // genuine crash. Don't race it, and don't alarm the user about
            // something that isn't actually broken.
            let Ok(operation) = crate::operations::create(app, Some(&environment.id), action)
            else {
                continue;
            };
            let outcome = crate::containers::operate(app, &environment.id, action);
            match &outcome {
                Ok(_) => {
                    let _ = crate::operations::complete(app, &operation.id);
                }
                Err(error) => {
                    let _ = crate::operations::fail(app, &operation.id, error);
                }
            }
        }
        let names = problem_services
            .iter()
            .map(|service| service.name.clone())
            .collect::<Vec<_>>();
        notify(app, &settings, &environment.name, &names);
    }
}

struct ProblemService {
    name: String,
    /// `true` when the service has exited or died; `false` when it is still
    /// running but reporting an unhealthy healthcheck. The two need
    /// different remediation (see `heal_action` below).
    crashed: bool,
}

/// Picks the `containers::operate` action (if any) that should run for a
/// stack with these problem services, or `None` if LS Panel should just
/// notify without acting.
fn heal_action(problem_services: &[ProblemService], restart_policy: &str) -> Option<&'static str> {
    // A service reporting "unhealthy" is still running, so Docker/Podman's
    // restart policy (which only governs what happens after a container
    // *exits*) never kicks in for it — the only way to make the container
    // re-run its entrypoint and healthcheck is an explicit restart,
    // regardless of restart_policy. A genuinely crashed ("exited"/"dead")
    // service, on the other hand, only needs LS Panel to step in when
    // restart_policy is "no"; anything else already relaunches it on its own.
    if problem_services.iter().any(|service| !service.crashed) {
        Some("restart")
    } else if restart_policy == "no" {
        Some("start")
    } else {
        None
    }
}

/// Returns the services that are down or reporting unhealthy, or `None` when
/// the stack's state could not be read at all (runtime unavailable, not yet
/// provisioned) — callers should treat `None` as "can't tell" rather than
/// "healthy".
fn unhealthy_services(app: &tauri::AppHandle, id: &str) -> Option<Vec<ProblemService>> {
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
            .filter_map(|service| {
                let crashed = matches!(service.state.as_str(), "exited" | "dead");
                (crashed || service.health == "unhealthy").then_some(ProblemService {
                    name: service.name,
                    crashed,
                })
            })
            .collect(),
    )
}

fn should_notify(environment_id: &str) -> bool {
    let now = crate::monitor::now_secs();
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

#[cfg(test)]
mod tests {
    use super::{heal_action, ProblemService};

    fn crashed(name: &str) -> ProblemService {
        ProblemService {
            name: name.into(),
            crashed: true,
        }
    }

    fn unhealthy(name: &str) -> ProblemService {
        ProblemService {
            name: name.into(),
            crashed: false,
        }
    }

    #[test]
    fn a_running_but_unhealthy_service_is_restarted_regardless_of_restart_policy() {
        // Regression test: Docker's restart policy only governs what happens
        // after a container exits, so it can never bring a running-but-
        // unhealthy service back to health. Only an explicit restart does.
        for policy in ["no", "always", "unless-stopped", "on-failure"] {
            assert_eq!(heal_action(&[unhealthy("web")], policy), Some("restart"));
        }
    }

    #[test]
    fn a_crashed_service_is_started_only_when_the_restart_policy_is_no() {
        assert_eq!(heal_action(&[crashed("web")], "no"), Some("start"));
        assert_eq!(heal_action(&[crashed("web")], "always"), None);
        assert_eq!(heal_action(&[crashed("web")], "unless-stopped"), None);
    }

    #[test]
    fn a_mix_of_crashed_and_unhealthy_services_restarts_the_whole_stack() {
        assert_eq!(
            heal_action(&[crashed("db"), unhealthy("web")], "always"),
            Some("restart")
        );
    }
}
