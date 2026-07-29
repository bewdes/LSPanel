use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::Mutex,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}
#[derive(Default)]
pub struct TerminalSessions(Mutex<HashMap<String, Session>>);

pub fn shutdown(app: &tauri::AppHandle) {
    let sessions = app.state::<TerminalSessions>();
    if let Ok(mut sessions) = sessions.0.lock() {
        for session in sessions.values_mut() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
        sessions.clear();
    };
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: String,
}

pub fn open(
    app: tauri::AppHandle,
    sessions: State<'_, TerminalSessions>,
    site_id: String,
    service: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let native_directory = crate::containers::native_terminal_directory(&app, &site_id)?;
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: rows.max(2),
            cols: cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;
    let mut command = if let Some(directory) = native_directory {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
        let mut command = CommandBuilder::new(shell);
        command.cwd(directory);
        command
    } else {
        let (runtime, directory, working_directory) =
            crate::containers::terminal_context(&app, &site_id, &service)?;
        let mut command = CommandBuilder::new(runtime);
        command.args(["compose", "exec"]);
        if let Some(working_directory) = working_directory {
            command.args(["--workdir", &working_directory]);
        }
        command.args([&service, "sh"]);
        command.cwd(directory);
        command
    };
    for key in [
        "LD_LIBRARY_PATH",
        "LD_PRELOAD",
        "DOCKER_HOST",
        "CONTAINER_HOST",
    ] {
        command.env_remove(key)
    }
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let session_id = format!(
        "terminal-{}-{site_id}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    sessions
        .0
        .lock()
        .map_err(|_| "Terminal manager is unavailable")?
        .insert(
            session_id.clone(),
            Session {
                master: pair.master,
                writer,
                child,
            },
        );
    let event_app = app;
    let event_id = session_id.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(size) => {
                    let data = String::from_utf8_lossy(&buffer[..size]).to_string();
                    let _ = event_app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: event_id.clone(),
                            data,
                        },
                    );
                }
            }
        }
        let _ = event_app.emit(
            "terminal-exited",
            TerminalOutput {
                session_id: event_id,
                data: String::new(),
            },
        );
    });
    Ok(session_id)
}
pub fn write(
    sessions: State<'_, TerminalSessions>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut guard = sessions
        .0
        .lock()
        .map_err(|_| "Terminal manager is unavailable")?;
    let session = guard
        .get_mut(&session_id)
        .ok_or("Terminal session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|error| error.to_string())
}
pub fn resize(
    sessions: State<'_, TerminalSessions>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let guard = sessions
        .0
        .lock()
        .map_err(|_| "Terminal manager is unavailable")?;
    let session = guard.get(&session_id).ok_or("Terminal session not found")?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(2),
            cols: cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}
pub fn close(sessions: State<'_, TerminalSessions>, session_id: String) -> Result<(), String> {
    if let Some(mut session) = sessions
        .0
        .lock()
        .map_err(|_| "Terminal manager is unavailable")?
        .remove(&session_id)
    {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}
impl Drop for TerminalSessions {
    fn drop(&mut self) {
        if let Ok(sessions) = self.0.get_mut() {
            for session in sessions.values_mut() {
                let _ = session.child.kill();
                let _ = session.child.wait();
            }
        }
    }
}
