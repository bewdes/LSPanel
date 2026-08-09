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
    crate::monitor::run_periodic(app, CHECK_INTERVAL, Duration::ZERO, check);
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
    let now = crate::monitor::now_secs();
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
                // CPU alone can't tell a genuinely idle stack from a PHP
                // request paused at an Xdebug breakpoint — a paused debugger
                // holds an open connection back to the IDE but uses ~0% CPU
                // for as long as the developer is stepping through code, so
                // treat that connection the same as active CPU.
                if xdebug_session_active(app, environment).unwrap_or(true) {
                    idle_since.remove(&environment.id);
                    continue;
                }
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

/// `Some(true)` when the `php` service has an established connection back to
/// its configured Xdebug client port (a debugger is attached, possibly
/// paused at a breakpoint), `Some(false)` when it doesn't or Xdebug isn't
/// enabled, `None` when this can't be determined.
fn xdebug_session_active(
    app: &tauri::AppHandle,
    environment: &crate::containers::Environment,
) -> Option<bool> {
    if !environment.php_xdebug {
        return Some(false);
    }
    let preferred = crate::settings::load(app).ok().flatten().map(|s| s.runtime);
    let status = crate::containers::detect_runtime(preferred.as_deref());
    let executable = status
        .runtime
        .filter(|_| status.running && status.compose_available)?;
    let directory = crate::containers::stack_directory(app, &environment.id).ok()?;
    if !directory.join("compose.yaml").exists() {
        return None;
    }
    // Nginx stacks run PHP-FPM in its own "php" service; Apache stacks run
    // mod_php inside "web" and never have a separate "php" service at all.
    let service = if environment.web_server == "Nginx" {
        "php"
    } else {
        "web"
    };
    let output = crate::containers::runtime_command(&executable)
        .args([
            "compose",
            "exec",
            "-T",
            service,
            "cat",
            "/proc/net/tcp",
            "/proc/net/tcp6",
        ])
        .current_dir(&directory)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        // Couldn't confirm either way (container not running the request,
        // /proc unavailable in this image, etc.) — undeterminable, not
        // "definitely not active"; the caller treats this like active CPU.
        return None;
    }
    Some(has_established_connection_to_port(
        &String::from_utf8_lossy(&output.stdout),
        environment.php_xdebug_port,
    ))
}

/// Parses the kernel's `/proc/net/tcp{,6}` table format and reports whether
/// any socket is ESTABLISHED (state `01`) with the given remote port.
fn has_established_connection_to_port(proc_net_tcp: &str, port: u16) -> bool {
    let port_hex = format!("{port:04X}");
    proc_net_tcp.lines().skip(1).any(|line| {
        let fields = line.split_whitespace().collect::<Vec<_>>();
        let (Some(remote), Some(state)) = (fields.get(2), fields.get(3)) else {
            return false;
        };
        let Some((_, remote_port)) = remote.split_once(':') else {
            return false;
        };
        state.eq_ignore_ascii_case("01") && remote_port.eq_ignore_ascii_case(&port_hex)
    })
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

#[cfg(test)]
mod tests {
    use super::{has_established_connection_to_port, json_rows};

    #[test]
    fn parses_both_ndjson_and_json_array_stats_output() {
        let ndjson = "{\"Service\":\"web\",\"CPUPerc\":\"0.00%\"}\n{\"Service\":\"php\",\"CPUPerc\":\"2.50%\"}\n";
        let rows = json_rows(ndjson);
        assert_eq!(rows.len(), 2);

        let array = "[{\"Service\":\"web\",\"CPUPerc\":\"0.00%\"}]";
        assert_eq!(json_rows(array).len(), 1);

        assert!(json_rows("not json at all").is_empty());
    }

    #[test]
    fn detects_an_established_connection_to_the_configured_xdebug_port() {
        // Regression test: a request paused at an Xdebug breakpoint holds an
        // ESTABLISHED connection back to the IDE's listener the whole time,
        // even though the process is using ~0% CPU while paused.
        let proc_net_tcp = "  sl  local_address rem_address   st tx_queue:rx_queue tr:tm->when retrnsmt   uid  timeout inode\n   0: 0100007F:9C42 0100007F:232B 01 00000000:00000000 00:00000000 00000000     0        0 12345 1 0000000000000000 20 4 30 10 -1\n";
        assert!(has_established_connection_to_port(proc_net_tcp, 9003));
        assert!(!has_established_connection_to_port(proc_net_tcp, 9004));
    }

    #[test]
    fn ignores_connections_to_the_xdebug_port_that_are_not_established() {
        // State 08 = TCP_CLOSE_WAIT: the debugger session has already
        // disconnected, so this must not count as active.
        let proc_net_tcp = "  sl  local_address rem_address   st tx_queue:rx_queue tr:tm->when retrnsmt   uid  timeout inode\n   0: 0100007F:9C42 0100007F:232B 08 00000000:00000000 00:00000000 00000000     0        0 12345 1 0000000000000000 20 4 30 10 -1\n";
        assert!(!has_established_connection_to_port(proc_net_tcp, 9003));
    }

    #[test]
    fn ignores_the_header_line_and_malformed_input() {
        assert!(!has_established_connection_to_port("", 9003));
        assert!(!has_established_connection_to_port(
            "  sl  local_address rem_address   st ...\n",
            9003
        ));
    }
}
