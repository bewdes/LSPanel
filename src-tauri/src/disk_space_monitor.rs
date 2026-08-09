use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CHECK_INTERVAL: Duration = Duration::from_secs(15 * 60);
const RENOTIFY_INTERVAL_MS: i64 = 6 * 60 * 60 * 1000;
const BYTES_PER_GB: u64 = 1_000_000_000;

static LAST_ALERT_AT: AtomicI64 = AtomicI64::new(0);

pub fn start(app: &tauri::AppHandle) {
    crate::monitor::run_periodic(app, CHECK_INTERVAL, Duration::ZERO, check);
}

fn check(app: &tauri::AppHandle) {
    let settings = crate::settings::load(app)
        .ok()
        .flatten()
        .unwrap_or_default();
    if !settings.disk_space_alert_enabled || settings.sites_directory.trim().is_empty() {
        return;
    }
    let Ok(free_bytes) = crate::disk_usage::free_space(&settings.sites_directory) else {
        return;
    };
    let threshold_bytes = u64::from(settings.disk_space_alert_threshold_gb) * BYTES_PER_GB;
    if free_bytes >= threshold_bytes {
        LAST_ALERT_AT.store(0, Ordering::Relaxed);
        return;
    }
    let now = now_ms();
    let last = LAST_ALERT_AT.load(Ordering::Relaxed);
    if now - last < RENOTIFY_INTERVAL_MS {
        return;
    }
    LAST_ALERT_AT.store(now, Ordering::Relaxed);
    notify(app, &settings, free_bytes);
}

fn notify(app: &tauri::AppHandle, settings: &crate::settings::AppSettings, free_bytes: u64) {
    let uk = settings.language == "uk";
    let free_gb = free_bytes / BYTES_PER_GB;
    let body = if uk {
        format!("У каталозі сайтів залишилося лише {free_gb} ГБ вільного місця")
    } else {
        format!("Only {free_gb} GB of free space left in the sites directory")
    };
    crate::notifications::send(app, "disk-space", "LS Panel", &body);
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
