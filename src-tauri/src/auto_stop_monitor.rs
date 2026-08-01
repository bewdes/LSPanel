use std::collections::{HashMap, HashSet};
use std::process::Stdio;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const CHECK_INTERVAL: Duration = Duration::from_secs(5 * 60);
const IDLE_CPU_THRESHOLD_PERCENT: f64 = 1.0;

/// Environment id -> unix seconds since its containers were first observed idle
/// (below `IDLE_CPU_THRESHOLD_PERCENT` CPU). Cleared whenever activity resumes
/// or the environment stops, so a fresh idle window always starts from zero.
static IDLE_SINCE: LazyLock<Mutex<HashMap<String, i64>>> =
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
    if !settings.auto_stop_idle_enabled {
        return;
    }
    let Ok(environments) = crate::containers::list(app) else {
        return;
    };
    let now = now_secs();
    let idle_threshold_secs = i64::from(settings.auto_stop_idle_minutes) * 60;
    let mut idle_since = IDLE_SINCE.lock().unwrap_or_else(|error| error.into_inner());
    let tracked_ids: HashSet<&str> = environments
        .iter()
        .filter(|environment| environment.runtime_mode != "native")
        .map(|environment| environment.id.as_str())
        .collect();
    idle_since.retain(|id, _| tracked_ids.contains(id.as_str()));

    for environment in &environments {
        // Native (containerless) processes have no `docker/podman stats` signal
        // to read activity from, so idle auto-stop is scoped to containers only.
        if environment.runtime_mode == "native" {
            continue;
        }
        let is_running = crate::containers::environment_status(app, &environment.id)
            .map(|state| state.status == "running")
            .unwrap_or(false);
        if !is_running {
            idle_since.remove(&environment.id);
            continue;
        }
        match cpu_is_active(app, &environment.id) {
            Some(true) | None => {
                idle_since.remove(&environment.id);
            }
            Some(false) => {
                let since = *idle_since.entry(environment.id.clone()).or_insert(now);
                if now - since >= idle_threshold_secs {
                    idle_since.remove(&environment.id);
                    if crate::containers::operate(app, &environment.id, "stop").is_ok() {
                        notify(app, &settings, &environment.name);
                    }
                }
            }
        }
    }
}

/// Returns `Some(true)` if any service is using meaningful CPU right now,
/// `Some(false)` if every service is idle, or `None` when stats could not be
/// read (stack not provisioned, runtime unavailable) — callers should treat
/// `None` like "active" so a temporary read failure never causes a stop.
fn cpu_is_active(app: &tauri::AppHandle, id: &str) -> Option<bool> {
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
        .args(["compose", "stats", "--no-stream", "--format", "json"])
        .current_dir(&directory)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let rows = json_rows(&text);
    if rows.is_empty() {
        return None;
    }
    Some(rows.iter().any(|row| {
        row.get("CPUPerc")
            .or_else(|| row.get("CPU"))
            .and_then(|value| value.as_str())
            .and_then(|value| value.trim_end_matches('%').parse::<f64>().ok())
            .is_some_and(|cpu| cpu >= IDLE_CPU_THRESHOLD_PERCENT)
    }))
}

fn json_rows(output: &str) -> Vec<serde_json::Value> {
    serde_json::from_str(output)
        .ok()
        .map(|value| match value {
            serde_json::Value::Array(values) => values,
            value => vec![value],
        })
        .unwrap_or_else(|| {
            output
                .lines()
                .filter_map(|line| serde_json::from_str(line).ok())
                .collect()
        })
}

fn notify(app: &tauri::AppHandle, settings: &crate::settings::AppSettings, environment_name: &str) {
    let uk = settings.language == "uk";
    let body = if uk {
        format!("Середовище «{environment_name}» зупинено через відсутність активності")
    } else {
        format!("Environment \"{environment_name}\" was stopped due to inactivity")
    };
    crate::notifications::send(app, "auto-stop", "LS Panel", &body);
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::json_rows;

    #[test]
    fn parses_both_ndjson_and_json_array_stats_output() {
        let ndjson = "{\"Service\":\"web\",\"CPUPerc\":\"0.00%\"}\n{\"Service\":\"php\",\"CPUPerc\":\"2.50%\"}\n";
        let rows = json_rows(ndjson);
        assert_eq!(rows.len(), 2);

        let array = "[{\"Service\":\"web\",\"CPUPerc\":\"0.00%\"}]";
        assert_eq!(json_rows(array).len(), 1);

        assert!(json_rows("not json at all").is_empty());
    }
}
