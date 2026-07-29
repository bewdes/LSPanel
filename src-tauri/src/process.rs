use std::{
    io::{BufRead, BufReader, Read},
    process::{Child, Command, ExitStatus, Output, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

pub const SHORT_TIMEOUT: Duration = Duration::from_secs(30);
pub const NETWORK_TIMEOUT: Duration = Duration::from_secs(5 * 60);
pub const GIT_CLONE_TIMEOUT: Duration = Duration::from_secs(60 * 60);
pub const DATABASE_TIMEOUT: Duration = Duration::from_secs(10 * 60);
pub const INSTALL_TIMEOUT: Duration = Duration::from_secs(30 * 60);
pub const CONTAINER_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MAX_CAPTURED_OUTPUT: usize = 10 * 1024 * 1024;

pub fn output(command: &mut Command, timeout: Duration, label: &str) -> Result<Output, String> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let child = command
        .spawn()
        .map_err(|error| format!("Failed to launch {label}: {error}"))?;
    child_output(child, timeout, label)
}

pub fn child_output(mut child: Child, timeout: Duration, label: &str) -> Result<Output, String> {
    let stdout = child
        .stdout
        .take()
        .map(|stream| thread::spawn(move || read_limited(stream)));
    let stderr = child
        .stderr
        .take()
        .map(|stream| thread::spawn(move || read_limited(stream)));
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                terminate(&mut child);
                let _ = child.wait();
                join_reader(stdout)?;
                join_reader(stderr)?;
                return Err(format!(
                    "{label} timed out after {} seconds and was terminated",
                    timeout.as_secs()
                ));
            }
            Err(error) => {
                terminate(&mut child);
                let _ = child.wait();
                return Err(format!("Failed while waiting for {label}: {error}"));
            }
        }
    };
    Ok(Output {
        status,
        stdout: join_reader(stdout)?,
        stderr: join_reader(stderr)?,
    })
}

pub fn stream_stderr(
    mut child: Child,
    timeout: Duration,
    label: &str,
    mut on_line: impl FnMut(String),
) -> Result<ExitStatus, String> {
    let stderr = child.stderr.take().ok_or("Command stderr is unavailable")?;
    let (sender, receiver) = mpsc::channel();
    let reader = thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    let started = Instant::now();
    loop {
        while let Ok(line) = receiver.try_recv() {
            on_line(line.map_err(|error| format!("Failed to read {label} output: {error}"))?);
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                let _ = reader.join();
                while let Ok(line) = receiver.try_recv() {
                    on_line(
                        line.map_err(|error| format!("Failed to read {label} output: {error}"))?,
                    );
                }
                return Ok(status);
            }
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                terminate(&mut child);
                let _ = child.wait();
                let _ = reader.join();
                return Err(format!(
                    "{label} timed out after {} seconds and was terminated",
                    timeout.as_secs()
                ));
            }
            Err(error) => {
                terminate(&mut child);
                let _ = child.wait();
                let _ = reader.join();
                return Err(format!("Failed while waiting for {label}: {error}"));
            }
        }
    }
}

pub(crate) fn terminate(child: &mut Child) {
    #[cfg(unix)]
    {
        let _ = Command::new("/bin/kill")
            .args(["-KILL", "--", &format!("-{}", child.id())])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
}

fn join_reader(
    reader: Option<thread::JoinHandle<std::io::Result<Vec<u8>>>>,
) -> Result<Vec<u8>, String> {
    reader
        .map(|reader| {
            reader
                .join()
                .map_err(|_| "Command output reader panicked".to_owned())?
                .map_err(|error| format!("Failed to read command output: {error}"))
        })
        .unwrap_or_else(|| Ok(Vec::new()))
}

fn read_limited(reader: impl Read) -> std::io::Result<Vec<u8>> {
    let mut data = Vec::new();
    reader
        .take((MAX_CAPTURED_OUTPUT + 1) as u64)
        .read_to_end(&mut data)?;
    if data.len() > MAX_CAPTURED_OUTPUT {
        data.truncate(MAX_CAPTURED_OUTPUT);
        data.extend_from_slice(b"\n[output truncated by LS Panel]\n");
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::{output, SHORT_TIMEOUT};
    use std::{process::Command, time::Duration};

    #[test]
    fn captures_command_output() {
        let result = output(
            Command::new("printf").arg("ready"),
            SHORT_TIMEOUT,
            "test command",
        )
        .unwrap();
        assert!(result.status.success());
        assert_eq!(result.stdout, b"ready");
    }

    #[test]
    fn terminates_command_after_timeout() {
        let error = output(
            Command::new("sleep").arg("2"),
            Duration::from_millis(50),
            "slow test command",
        )
        .unwrap_err();
        assert!(error.contains("timed out"));
    }
}
