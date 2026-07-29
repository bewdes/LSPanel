use std::sync::atomic::{AtomicU8, Ordering};

const IDLE: u8 = 0;
const RUNNING: u8 = 1;
const COMPLETE: u8 = 2;
static SHUTDOWN_STATE: AtomicU8 = AtomicU8::new(IDLE);

pub fn is_running() -> bool {
    SHUTDOWN_STATE.load(Ordering::SeqCst) == RUNNING
}

pub fn is_complete() -> bool {
    SHUTDOWN_STATE.load(Ordering::SeqCst) == COMPLETE
}

pub fn run(app: &tauri::AppHandle) -> bool {
    // ExitRequested and Exit can both be emitted during a normal close. The
    // cleanup contains blocking process/runtime calls, so it must run exactly
    // once while the application state is still fully available.
    if SHUTDOWN_STATE
        .compare_exchange(IDLE, RUNNING, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return false;
    }
    crate::livelink::shutdown(app);
    crate::logs::shutdown(app);
    crate::terminal::shutdown(app);
    crate::native_runtime::shutdown(app);
    crate::containers::shutdown(app);
    SHUTDOWN_STATE.store(COMPLETE, Ordering::SeqCst);
    true
}
