use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

const CHECK_INTERVAL: Duration = Duration::from_secs(12 * 60 * 60);
/// Re-alert at most once a day, so an unresolved certificate problem stays a
/// daily reminder instead of a notification every 12 hours.
const RENOTIFY_INTERVAL_MS: i64 = 24 * 60 * 60 * 1000;

static LAST_ALERT_AT: AtomicI64 = AtomicI64::new(0);

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
    if !settings.tls_expiry_notify_enabled {
        return;
    }
    let Ok(status) = crate::tls::status(app) else {
        return;
    };
    if !status.ca_exists {
        // Nothing provisioned yet — the welcome flow / System Health page
        // already guides the user through first-time setup.
        return;
    }
    let uk = settings.language == "uk";
    let mut problems = Vec::new();
    if !status.system_trusted {
        problems.push(if uk {
            "CA-сертифікат не довірений системою"
        } else {
            "The CA certificate is not trusted by the system"
        });
    }
    if !status.browsers_trusted {
        problems.push(if uk {
            "CA-сертифікат не довірений браузерами"
        } else {
            "The CA certificate is not trusted by browsers"
        });
    }
    let warning_seconds = i64::from(settings.tls_expiry_warning_days) * 24 * 60 * 60;
    if expires_soon(Path::new(&status.ca_path), warning_seconds) {
        problems.push(if uk {
            "Термін дії кореневого сертифіката (CA) добігає кінця"
        } else {
            "The root (CA) certificate is close to expiring"
        });
    }
    if status.certificate_exists
        && expires_soon(Path::new(&status.certificate_path), warning_seconds)
    {
        problems.push(if uk {
            "Термін дії сертифіката локальних сайтів добігає кінця"
        } else {
            "The local sites certificate is close to expiring"
        });
    }
    if problems.is_empty() {
        return;
    }
    let now = now_ms();
    let last = LAST_ALERT_AT.load(Ordering::Relaxed);
    if now - last < RENOTIFY_INTERVAL_MS {
        return;
    }
    LAST_ALERT_AT.store(now, Ordering::Relaxed);
    notify(app, &problems);
}

fn expires_soon(path: &Path, warning_seconds: i64) -> bool {
    if !path.is_file() {
        return false;
    }
    Command::new("openssl")
        .args([
            "x509",
            "-checkend",
            &warning_seconds.to_string(),
            "-noout",
            "-in",
        ])
        .arg(path)
        .stdin(Stdio::null())
        .output()
        .map(|output| !output.status.success())
        .unwrap_or(false)
}

fn notify(app: &tauri::AppHandle, problems: &[&str]) {
    let body = problems.join("; ");
    crate::notifications::send(app, "tls", "LS Panel", &body);
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
