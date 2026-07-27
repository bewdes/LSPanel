use serde::Serialize;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    process::Child,
    sync::{Arc, Mutex},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, State};

#[derive(Default)]
pub struct LogStreams(Mutex<HashMap<String, Arc<Mutex<Child>>>>);

impl Drop for LogStreams {
    fn drop(&mut self) {
        if let Ok(streams) = self.0.get_mut() {
            for child in streams.values() {
                if let Ok(mut child) = child.lock() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogLine {
    stream_id: String,
    environment_id: String,
    source: String,
    line: String,
}

pub fn start(
    app: tauri::AppHandle,
    streams: State<'_, LogStreams>,
    environment_id: String,
    service: Option<String>,
) -> Result<String, String> {
    let is_native = crate::containers::list(&app)?
        .into_iter()
        .find(|environment| environment.id == environment_id)
        .is_some_and(|environment| environment.runtime_mode == "native");
    if is_native {
        return crate::native_runtime::attach_log_stream(&app, &environment_id);
    }
    let mut process =
        crate::containers::spawn_log_stream(&app, &environment_id, service.as_deref())?;
    let stdout = process
        .child
        .stdout
        .take()
        .ok_or("Failed to capture Docker log output")?;
    let stderr = process
        .child
        .stderr
        .take()
        .ok_or("Failed to capture Docker log errors")?;
    let stream_id = format!(
        "logs-{}-{environment_id}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    streams
        .0
        .lock()
        .map_err(|_| "Log stream manager is unavailable")?
        .insert(stream_id.clone(), Arc::new(Mutex::new(process.child)));
    spawn_reader(
        app.clone(),
        stream_id.clone(),
        environment_id.clone(),
        "stdout",
        stdout,
        process.secrets.clone(),
    );
    spawn_reader(
        app,
        stream_id.clone(),
        environment_id,
        "stderr",
        stderr,
        process.secrets,
    );
    Ok(stream_id)
}

pub fn stop(streams: State<'_, LogStreams>, stream_id: String) -> Result<(), String> {
    let child = streams
        .0
        .lock()
        .map_err(|_| "Log stream manager is unavailable")?
        .remove(&stream_id);
    if let Some(child) = child {
        let mut child = child.lock().map_err(|_| "Log process is unavailable")?;
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

fn spawn_reader<R: std::io::Read + Send + 'static>(
    app: tauri::AppHandle,
    stream_id: String,
    environment_id: String,
    source: &'static str,
    reader: R,
    secrets: Vec<String>,
) {
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let line = crate::security::redact(&line, secrets.iter().cloned());
            let line = line
                .chars()
                .filter(|character| *character == '\t' || !character.is_control())
                .collect::<String>();
            let _ = app.emit(
                "environment-log-line",
                LogLine {
                    stream_id: stream_id.clone(),
                    environment_id: environment_id.clone(),
                    source: source.into(),
                    line,
                },
            );
        }
    });
}
