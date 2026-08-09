use std::time::Duration;

/// Spawns the standard background-monitor loop shared by every `*_monitor.rs`:
/// wait `initial_delay` (pass `Duration::ZERO` to check immediately), then
/// call `check` and sleep `interval`, forever.
pub fn run_periodic(
    app: &tauri::AppHandle,
    interval: Duration,
    initial_delay: Duration,
    check: fn(&tauri::AppHandle),
) {
    let app = app.clone();
    std::thread::spawn(move || {
        if !initial_delay.is_zero() {
            std::thread::sleep(initial_delay);
        }
        loop {
            check(&app);
            std::thread::sleep(interval);
        }
    });
}

/// Current unix time in whole seconds, used by monitors that track
/// per-resource cooldowns (e.g. "don't re-alert within N seconds").
pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
