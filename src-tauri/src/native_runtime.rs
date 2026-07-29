use crate::containers::{
    Environment, EnvironmentInspection, EnvironmentOperation, ServiceInspection,
};
use crate::sites::Site;
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

const LOG_BUFFER_LINES: usize = 500;

enum Backend {
    Process(Child),
    StaticServer(Arc<AtomicBool>),
}

struct RunningProcess {
    backend: Backend,
    log_buffer: Arc<Mutex<VecDeque<String>>>,
    cpu_sample: Option<(u64, Instant)>,
}

#[derive(Default)]
pub struct NativeProcesses(Mutex<HashMap<String, RunningProcess>>);

impl Drop for NativeProcesses {
    fn drop(&mut self) {
        if let Ok(processes) = self.0.get_mut() {
            for process in processes.values_mut() {
                kill_process(process);
            }
        }
    }
}

fn kill_process(process: &mut RunningProcess) {
    match &mut process.backend {
        Backend::Process(child) => {
            crate::process::terminate(child);
            let _ = child.wait();
        }
        Backend::StaticServer(shutdown) => shutdown.store(true, Ordering::SeqCst),
    }
}

/// Kills every tracked native process. Called when the app itself is
/// shutting down so dev servers/static servers never outlive the panel.
pub fn shutdown(app: &tauri::AppHandle) {
    let registry = app.state::<NativeProcesses>();
    if let Ok(mut processes) = registry.0.lock() {
        for process in processes.values_mut() {
            kill_process(process);
        }
        processes.clear();
    };
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogLine {
    stream_id: String,
    environment_id: String,
    source: String,
    line: String,
}

/// Finds an unused TCP port on 127.0.0.1, for prefilling the port field when a
/// project is switched to native runtime mode in the wizard.
pub fn find_available_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("Failed to allocate a port: {error}"))
}

pub fn status(app: &tauri::AppHandle, environment_id: &str) -> String {
    let registry = app.state::<NativeProcesses>();
    let Ok(mut processes) = registry.0.lock() else {
        return "stopped".into();
    };
    let is_running = match processes.get_mut(environment_id) {
        Some(process) => match &mut process.backend {
            Backend::StaticServer(_) => true,
            Backend::Process(child) => matches!(child.try_wait(), Ok(None)),
        },
        None => false,
    };
    if !is_running {
        processes.remove(environment_id);
    }
    if is_running {
        "running".into()
    } else {
        "stopped".into()
    }
}

pub fn operate(
    app: &tauri::AppHandle,
    environment: &Environment,
    action: &str,
) -> Result<EnvironmentOperation, String> {
    crate::container_lifecycle::emit_progress(
        app,
        &environment.id,
        10,
        "Preparing native environment",
    );
    crate::sites::ensure_directories(app, &environment.id)?;
    let output = match action {
        "start" | "restart" | "rebuild" | "rebuild-no-cache" => {
            if matches!(action, "restart" | "rebuild" | "rebuild-no-cache") {
                stop(app, &environment.id)?;
                thread::sleep(Duration::from_millis(200));
            }
            crate::container_lifecycle::emit_progress(app, &environment.id, 50, "Starting process");
            start(app, environment)?;
            crate::sites::mark_environment_started(app, &environment.id)?;
            "Native process started".to_string()
        }
        "stop" | "kill" | "destroy" => {
            crate::container_lifecycle::emit_progress(app, &environment.id, 50, "Stopping process");
            stop(app, &environment.id)?;
            "Native process stopped".to_string()
        }
        "pause" | "unpause" => {
            return Err("Pause is not supported for native environments".into());
        }
        _ => return Err("Unsupported action".into()),
    };
    crate::container_lifecycle::emit_progress(app, &environment.id, 100, "Completed");
    Ok(EnvironmentOperation {
        id: environment.id.clone(),
        status: action.into(),
        output,
    })
}

fn native_site(app: &tauri::AppHandle, environment_id: &str) -> Result<Site, String> {
    crate::sites::list(app)?
        .into_iter()
        .find(|site| site.environment_id == environment_id)
        .ok_or_else(|| "No project was found for this environment".into())
}

fn start(app: &tauri::AppHandle, environment: &Environment) -> Result<(), String> {
    let registry = app.state::<NativeProcesses>();
    if registry
        .0
        .lock()
        .map_err(|_| "Native process registry is unavailable")?
        .contains_key(&environment.id)
    {
        return Err("Native environment is already running".into());
    }
    let site = native_site(app, &environment.id)?;
    let port: u16 = environment
        .port
        .parse()
        .map_err(|_| "Invalid port for this environment")?;
    let directory = PathBuf::from(&site.directory);
    if !directory.is_dir() {
        return Err(format!(
            "Project directory not found: {}",
            directory.display()
        ));
    }
    if TcpListener::bind(("127.0.0.1", port)).is_err() {
        return Err(format!(
            "Port {port} is already in use. Something else (possibly a leftover process from a previous run) is listening on it — stop that process or choose a different port."
        ));
    }
    let log_buffer: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
    let backend = if site.project_type == "static" {
        let shutdown = Arc::new(AtomicBool::new(false));
        spawn_static_server(
            app.clone(),
            environment.id.clone(),
            directory,
            port,
            shutdown.clone(),
            log_buffer.clone(),
        )?;
        Backend::StaticServer(shutdown)
    } else {
        let child = start_node_process(app, environment, &directory, port, &log_buffer)?;
        Backend::Process(child)
    };
    registry
        .0
        .lock()
        .map_err(|_| "Native process registry is unavailable")?
        .insert(
            environment.id.clone(),
            RunningProcess {
                backend,
                log_buffer,
                cpu_sample: None,
            },
        );
    Ok(())
}

fn start_node_process(
    app: &tauri::AppHandle,
    environment: &Environment,
    directory: &Path,
    port: u16,
    log_buffer: &Arc<Mutex<VecDeque<String>>>,
) -> Result<Child, String> {
    if environment.node_auto_install && directory.join("package.json").exists() {
        run_blocking(
            app,
            &environment.id,
            &[environment.node_package_manager.clone(), "install".into()],
            directory,
            log_buffer,
        )?;
    }
    let configured_run_command = if environment.node_run_mode == "start" {
        &environment.node_start_command
    } else {
        &environment.node_dev_command
    };
    let tokens = configured_command(configured_run_command)
        .or_else(|| configured_command(&environment.node_command))
        .ok_or_else(|| {
            format!(
                "Configure a {} command for this Node.js/React environment",
                if environment.node_run_mode == "start" {
                    "start"
                } else {
                    "dev"
                }
            )
        })?;
    let mut command = Command::new(&tokens[0]);
    command
        .args(&tokens[1..])
        .current_dir(directory)
        .envs(environment.environment_variables.iter())
        .env("PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start '{}': {error}", tokens.join(" ")))?;
    if let Some(stdout) = child.stdout.take() {
        spawn_reader(
            app.clone(),
            environment.id.clone(),
            "stdout",
            stdout,
            log_buffer.clone(),
        );
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_reader(
            app.clone(),
            environment.id.clone(),
            "stderr",
            stderr,
            log_buffer.clone(),
        );
    }
    Ok(child)
}

fn run_blocking(
    app: &tauri::AppHandle,
    environment_id: &str,
    tokens: &[String],
    directory: &Path,
    log_buffer: &Arc<Mutex<VecDeque<String>>>,
) -> Result<(), String> {
    let mut command = Command::new(&tokens[0]);
    command
        .args(&tokens[1..])
        .current_dir(directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to run '{}': {error}", tokens.join(" ")))?;
    let stdout_reader = child.stdout.take().map(|stdout| {
        spawn_reader(
            app.clone(),
            environment_id.into(),
            "stdout",
            stdout,
            log_buffer.clone(),
        )
    });
    let stderr_reader = child.stderr.take().map(|stderr| {
        spawn_reader(
            app.clone(),
            environment_id.into(),
            "stderr",
            stderr,
            log_buffer.clone(),
        )
    });
    let status = child.wait().map_err(|error| error.to_string())?;
    if let Some(handle) = stdout_reader {
        let _ = handle.join();
    }
    if let Some(handle) = stderr_reader {
        let _ = handle.join();
    }
    if !status.success() {
        return Err(format!(
            "'{}' exited with a non-zero status",
            tokens.join(" ")
        ));
    }
    Ok(())
}

fn configured_command(raw: &str) -> Option<Vec<String>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    shell_words::split(trimmed)
        .ok()
        .filter(|tokens| !tokens.is_empty())
}

pub fn stop(app: &tauri::AppHandle, environment_id: &str) -> Result<(), String> {
    let registry = app.state::<NativeProcesses>();
    let process = registry
        .0
        .lock()
        .map_err(|_| "Native process registry is unavailable")?
        .remove(environment_id);
    let Some(mut process) = process else {
        return Ok(());
    };
    match &mut process.backend {
        Backend::Process(child) => {
            crate::process::terminate(child);
            let _ = child.wait();
        }
        Backend::StaticServer(shutdown) => shutdown.store(true, Ordering::SeqCst),
    }
    Ok(())
}

pub fn inspect(
    app: &tauri::AppHandle,
    environment: &Environment,
) -> Result<EnvironmentInspection, String> {
    let site_directory = native_site(app, &environment.id)
        .map(|site| site.directory)
        .unwrap_or_default();
    let running = status(app, &environment.id) == "running";
    let logs = {
        let registry = app.state::<NativeProcesses>();
        registry
            .0
            .lock()
            .ok()
            .and_then(|processes| {
                processes.get(&environment.id).and_then(|process| {
                    process
                        .log_buffer
                        .lock()
                        .ok()
                        .map(|buffer| buffer.iter().cloned().collect::<Vec<_>>().join("\n"))
                })
            })
            .unwrap_or_default()
    };
    Ok(EnvironmentInspection {
        id: environment.id.clone(),
        status: if running {
            "running".into()
        } else {
            "stopped".into()
        },
        provisioned: true,
        running_services: if running { 1 } else { 0 },
        services: resources(app, &environment.id),
        logs: crate::security::redact(
            &logs,
            crate::security::environment_secrets(app, &environment.id),
        ),
        site_directory,
        compose_file: String::new(),
    })
}

/// Reports live CPU/memory usage for the tracked process (Linux only, via
/// `/proc`), so native environments contribute to the same resource-usage
/// aggregation as container services instead of silently reporting nothing.
pub fn resources(app: &tauri::AppHandle, environment_id: &str) -> Vec<ServiceInspection> {
    let registry = app.state::<NativeProcesses>();
    let Ok(mut processes) = registry.0.lock() else {
        return Vec::new();
    };
    let Some(process) = processes.get_mut(environment_id) else {
        return Vec::new();
    };
    let Backend::Process(child) = &process.backend else {
        return Vec::new();
    };
    let pid = child.id();
    let now = Instant::now();
    let ticks_now = read_process_cpu_ticks(pid);
    let cpu_percent = match (ticks_now, process.cpu_sample) {
        (Some(ticks_now), Some((previous_ticks, previous_time))) => {
            let elapsed = now.duration_since(previous_time).as_secs_f64();
            if elapsed > 0.0 && ticks_now >= previous_ticks {
                ((ticks_now - previous_ticks) as f64 / CLOCK_TICKS_PER_SECOND) / elapsed * 100.0
            } else {
                0.0
            }
        }
        _ => 0.0,
    };
    if let Some(ticks_now) = ticks_now {
        process.cpu_sample = Some((ticks_now, now));
    }
    let memory = read_process_rss_kib(pid)
        .map(|kib| format!("{:.1}MiB", kib as f64 / 1024.0))
        .unwrap_or_else(|| "—".into());
    vec![ServiceInspection {
        name: "process".into(),
        container_name: String::new(),
        state: "running".into(),
        health: "running".into(),
        cpu: format!("{cpu_percent:.2}%"),
        memory,
        network_io: String::new(),
        block_io: String::new(),
    }]
}

#[cfg(target_os = "linux")]
const CLOCK_TICKS_PER_SECOND: f64 = 100.0;

#[cfg(target_os = "linux")]
fn read_process_cpu_ticks(pid: u32) -> Option<u64> {
    let contents = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let after_comm = contents.rsplit_once(')')?.1;
    let fields: Vec<&str> = after_comm.split_whitespace().collect();
    let utime: u64 = fields.get(11)?.parse().ok()?;
    let stime: u64 = fields.get(12)?.parse().ok()?;
    Some(utime + stime)
}

#[cfg(target_os = "linux")]
fn read_process_rss_kib(pid: u32) -> Option<u64> {
    let contents = fs::read_to_string(format!("/proc/{pid}/status")).ok()?;
    contents.lines().find_map(|line| {
        line.strip_prefix("VmRSS:")
            .and_then(|rest| rest.split_whitespace().next())
            .and_then(|value| value.parse().ok())
    })
}

#[cfg(not(target_os = "linux"))]
const CLOCK_TICKS_PER_SECOND: f64 = 100.0;

#[cfg(not(target_os = "linux"))]
fn read_process_cpu_ticks(_pid: u32) -> Option<u64> {
    None
}

#[cfg(not(target_os = "linux"))]
fn read_process_rss_kib(_pid: u32) -> Option<u64> {
    None
}

/// Replays buffered output and returns the stream id (the environment id
/// itself, since a native environment runs at most one long-lived process) so
/// that the existing `live-logs.tsx` component, which already listens for the
/// `environment-log-line` event, works for native environments unchanged.
pub fn attach_log_stream(app: &tauri::AppHandle, environment_id: &str) -> Result<String, String> {
    let registry = app.state::<NativeProcesses>();
    let buffered = {
        let processes = registry
            .0
            .lock()
            .map_err(|_| "Native process registry is unavailable")?;
        let process = processes
            .get(environment_id)
            .ok_or("Native environment is not running")?;
        let buffer = process
            .log_buffer
            .lock()
            .map_err(|_| "Log buffer is unavailable")?;
        buffer.iter().cloned().collect::<Vec<_>>()
    };
    for line in buffered {
        emit_line(app, environment_id, "history", line, None);
    }
    Ok(environment_id.to_string())
}

fn spawn_reader<R: Read + Send + 'static>(
    app: tauri::AppHandle,
    environment_id: String,
    source: &'static str,
    reader: R,
    log_buffer: Arc<Mutex<VecDeque<String>>>,
) -> thread::JoinHandle<()> {
    let secrets = crate::security::environment_secrets(&app, &environment_id);
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let line = crate::security::redact(&line, secrets.iter().cloned());
            let line: String = line
                .chars()
                .filter(|character| *character == '\t' || !character.is_control())
                .collect();
            emit_line(&app, &environment_id, source, line, Some(&log_buffer));
        }
    })
}

fn emit_line(
    app: &tauri::AppHandle,
    environment_id: &str,
    source: &str,
    line: String,
    log_buffer: Option<&Arc<Mutex<VecDeque<String>>>>,
) {
    if let Some(log_buffer) = log_buffer {
        if let Ok(mut buffer) = log_buffer.lock() {
            buffer.push_back(line.clone());
            while buffer.len() > LOG_BUFFER_LINES {
                buffer.pop_front();
            }
        }
    }
    let _ = app.emit(
        "environment-log-line",
        LogLine {
            stream_id: environment_id.into(),
            environment_id: environment_id.into(),
            source: source.into(),
            line,
        },
    );
}

fn spawn_static_server(
    app: tauri::AppHandle,
    environment_id: String,
    root: PathBuf,
    port: u16,
    shutdown: Arc<AtomicBool>,
    log_buffer: Arc<Mutex<VecDeque<String>>>,
) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|error| format!("Failed to bind 127.0.0.1:{port}: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    emit_line(
        &app,
        &environment_id,
        "static",
        format!("Serving {} on http://127.0.0.1:{port}", root.display()),
        Some(&log_buffer),
    );
    thread::spawn(move || {
        while !shutdown.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let root = root.clone();
                    thread::spawn(move || handle_static_request(stream, &root));
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(100));
                }
                Err(_) => thread::sleep(Duration::from_millis(100)),
            }
        }
    });
    Ok(())
}

fn handle_static_request(mut stream: std::net::TcpStream, root: &Path) {
    let mut buffer = [0_u8; 8192];
    let read = match stream.read(&mut buffer) {
        Ok(read) => read,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buffer[..read]);
    let requested_path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");
    let requested_path = requested_path.split(['?', '#']).next().unwrap_or("/");
    let decoded = percent_decode(requested_path);
    let relative = decoded.trim_start_matches('/');
    let mut file_path = root.join(relative);
    if relative.is_empty() || file_path.is_dir() {
        file_path = file_path.join("index.html");
    }
    let root_canonical = root.canonicalize().ok();
    let file_canonical = file_path.canonicalize().ok();
    let is_within_root = match (&root_canonical, &file_canonical) {
        (Some(root), Some(file)) => file.starts_with(root),
        _ => false,
    };
    let response = if is_within_root {
        match fs::read(&file_path) {
            Ok(contents) => {
                let mime = mime_for(&file_path);
                let mut response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    contents.len()
                )
                .into_bytes();
                response.extend_from_slice(&contents);
                response
            }
            Err(_) => not_found(),
        }
    } else {
        not_found()
    };
    let _ = stream.write_all(&response);
}

fn not_found() -> Vec<u8> {
    let body = b"404 Not Found";
    let mut response = format!(
        "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    response.extend_from_slice(body);
    response
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "webp" => "image/webp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
                output.push(byte);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}
