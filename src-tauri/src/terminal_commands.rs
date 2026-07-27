#[tauri::command]
pub fn open_container_terminal(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, crate::terminal::TerminalSessions>,
    site_id: String,
    service: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    crate::terminal::open(app, sessions, site_id, service, cols, rows)
}

#[tauri::command]
pub fn write_container_terminal(
    sessions: tauri::State<'_, crate::terminal::TerminalSessions>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    crate::terminal::write(sessions, session_id, data)
}

#[tauri::command]
pub fn resize_container_terminal(
    sessions: tauri::State<'_, crate::terminal::TerminalSessions>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    crate::terminal::resize(sessions, session_id, cols, rows)
}

#[tauri::command]
pub fn close_container_terminal(
    sessions: tauri::State<'_, crate::terminal::TerminalSessions>,
    session_id: String,
) -> Result<(), String> {
    crate::terminal::close(sessions, session_id)
}

#[tauri::command]
pub fn list_saved_commands(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<Vec<crate::quick_commands::SavedCommand>, String> {
    crate::quick_commands::list(&app, &site_id)
}

#[tauri::command]
pub fn save_quick_command(
    app: tauri::AppHandle,
    site_id: String,
    label: String,
    command: String,
    service: String,
) -> Result<crate::quick_commands::SavedCommand, String> {
    crate::quick_commands::save(&app, &site_id, &label, &command, &service)
}

#[tauri::command]
pub fn delete_quick_command(app: tauri::AppHandle, site_id: String, id: i64) -> Result<(), String> {
    crate::quick_commands::delete(&app, &site_id, id)
}

#[tauri::command]
pub fn list_command_history(
    app: tauri::AppHandle,
    site_id: String,
) -> Result<Vec<crate::quick_commands::CommandHistoryEntry>, String> {
    crate::quick_commands::history(&app, &site_id)
}

#[tauri::command]
pub fn record_command_history(
    app: tauri::AppHandle,
    site_id: String,
    service: String,
    command: String,
) -> Result<Option<crate::quick_commands::CommandHistoryEntry>, String> {
    crate::quick_commands::record_history(&app, &site_id, &service, &command)
}

#[tauri::command]
pub fn clear_command_history(app: tauri::AppHandle, site_id: String) -> Result<(), String> {
    crate::quick_commands::clear_history(&app, &site_id)
}
