use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CHECK_INTERVAL: Duration = Duration::from_secs(15 * 60);

pub fn start(app: &tauri::AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        run_due_backups(&app);
        std::thread::sleep(CHECK_INTERVAL);
    });
}

fn run_due_backups(app: &tauri::AppHandle) {
    let Ok(environments) = crate::containers::list(app) else {
        return;
    };
    for environment in environments {
        if !environment.backup_schedule_enabled || !is_due(app, &environment) {
            continue;
        }
        if crate::backups::create(app, &environment.id).is_ok() {
            let _ = crate::backups::prune(
                app,
                &environment.id,
                environment.backup_retention_count as usize,
                None,
            );
        }
    }
}

fn is_due(app: &tauri::AppHandle, environment: &crate::containers::Environment) -> bool {
    let Ok(backups) = crate::backups::list(app, &environment.id) else {
        return true;
    };
    let Some(latest) = backups.first() else {
        return true;
    };
    let interval_ms = i64::from(environment.backup_schedule_interval_hours) * 60 * 60 * 1000;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    now - latest.created_at >= interval_ms
}
