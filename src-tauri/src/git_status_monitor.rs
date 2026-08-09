use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const CHECK_INTERVAL: Duration = Duration::from_secs(20 * 60);
/// Don't re-alert about the same site more than once every 6 hours, so a
/// branch that's been left behind doesn't spam a notification every check.
const RENOTIFY_INTERVAL_SECS: i64 = 6 * 60 * 60;

static LAST_ALERT: LazyLock<Mutex<HashMap<String, i64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn start(app: &tauri::AppHandle) {
    crate::monitor::run_periodic(app, CHECK_INTERVAL, Duration::ZERO, check);
}

fn check(app: &tauri::AppHandle) {
    let settings = crate::settings::load(app)
        .ok()
        .flatten()
        .unwrap_or_default();
    if !settings.git_status_notify_enabled {
        return;
    }
    let Ok(sites) = crate::sites::list(app) else {
        return;
    };
    for site in &sites {
        if !site.enabled {
            continue;
        }
        // Every site's actual git repository lives in `app/` under the
        // project directory (see e.g. site-details-page.tsx), not at the
        // project root itself.
        let repository = format!("{}/app", site.directory);
        // A quiet, read-only fetch is required first: local refs only know
        // about the remote's state as of the last fetch, so without this the
        // "behind" count would just reflect however stale the repo happens
        // to be rather than the actual gap right now.
        if crate::git::action(&repository, "fetch", "").is_err() {
            continue;
        }
        let Ok(status) = crate::git::status(&repository) else {
            continue;
        };
        if !status.repository || status.behind < settings.git_status_behind_threshold as usize {
            continue;
        }
        if should_notify(&site.id) {
            notify(app, &settings, &site.name, &status);
        }
    }
}

fn should_notify(site_id: &str) -> bool {
    let now = crate::monitor::now_secs();
    let mut last_alert = LAST_ALERT.lock().unwrap_or_else(|error| error.into_inner());
    match last_alert.get(site_id) {
        Some(&last) if now - last < RENOTIFY_INTERVAL_SECS => false,
        _ => {
            last_alert.insert(site_id.to_string(), now);
            true
        }
    }
}

fn notify(
    app: &tauri::AppHandle,
    settings: &crate::settings::AppSettings,
    site_name: &str,
    status: &crate::git::GitStatus,
) {
    let uk = settings.language == "uk";
    let body = if uk {
        format!(
            "«{site_name}» ({}): гілка відстає від origin на {} комітів",
            status.branch, status.behind
        )
    } else {
        format!(
            "\"{site_name}\" ({}): branch is {} commits behind origin",
            status.branch, status.behind
        )
    };
    crate::notifications::send(app, "git-status", "LS Panel", &body);
}
