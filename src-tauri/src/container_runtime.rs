use serde::Serialize;
use std::{
    path::Path,
    process::{Command, Stdio},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub runtime: Option<String>,
    pub installed: bool,
    pub running: bool,
    pub version: Option<String>,
    pub compose_available: bool,
    pub message: String,
}

pub fn detect(preferred: Option<&str>) -> RuntimeStatus {
    let runtimes: &[&str] = match preferred {
        Some("docker") => &["docker"],
        Some("podman") => &["podman"],
        _ => &["docker", "podman"],
    };
    let mut best_fallback: Option<RuntimeStatus> = None;
    for runtime in runtimes {
        if let Some(status) = inspect(runtime) {
            if status.running && status.compose_available {
                return status;
            }
            let current_score = score(&status);
            let best_score = best_fallback.as_ref().map(score).unwrap_or(0);
            if current_score > best_score {
                best_fallback = Some(status);
            }
        }
    }
    best_fallback.unwrap_or(RuntimeStatus {
        runtime: None,
        installed: false,
        running: false,
        version: None,
        compose_available: false,
        message: "Docker или Podman не найден".into(),
    })
}

fn score(status: &RuntimeStatus) -> u8 {
    u8::from(status.installed)
        + u8::from(status.running) * 2
        + u8::from(status.compose_available) * 4
}

fn inspect(runtime: &str) -> Option<RuntimeStatus> {
    let version_output = crate::process::output(
        command(runtime)
            .args(["version", "--format", "{{.Client.Version}}"])
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "container runtime version",
    )
    .ok()?;
    if !version_output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&version_output.stdout)
        .trim()
        .to_owned();
    let info_template = if runtime == "podman" {
        "{{.Version.Version}}"
    } else {
        "{{.ServerVersion}}"
    };
    let server = crate::process::output(
        command(runtime)
            .args(["info", "--format", info_template])
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "container runtime status",
    );
    let running = server.as_ref().is_ok_and(|output| output.status.success());
    let runtime_error = server
        .as_ref()
        .map(|output| String::from_utf8_lossy(&output.stderr).trim().to_owned())
        .unwrap_or_else(|error| error.to_string());
    let integrated_compose = crate::process::output(
        command(runtime)
            .args(["compose", "version"])
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Compose version",
    )
    .is_ok_and(|output| output.status.success());
    let external_compose = runtime == "podman"
        && ["/usr/bin/podman-compose", "/usr/local/bin/podman-compose"]
            .iter()
            .any(|provider| Path::new(provider).is_file());
    let compose_available = integrated_compose || external_compose;

    Some(RuntimeStatus {
        runtime: Some(runtime.into()),
        installed: true,
        running,
        version: (!version.is_empty()).then_some(version),
        compose_available,
        message: if !running {
            format!(
                "{} is unavailable: {}",
                if runtime == "podman" {
                    "Podman"
                } else {
                    "Docker daemon"
                },
                if runtime_error.is_empty() {
                    "runtime check failed"
                } else {
                    &runtime_error
                }
            )
        } else if !compose_available {
            "Compose provider is not installed. Install podman-compose or Docker Compose v2".into()
        } else {
            "Runtime ready".into()
        },
    })
}

pub(crate) fn command(runtime: &str) -> Command {
    let mut command = Command::new(runtime);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("LD_PRELOAD")
        .env_remove("DOCKER_HOST")
        .env_remove("CONTAINER_HOST");
    if runtime.ends_with("podman") && Path::new("/usr/bin/podman-compose").is_file() {
        command.env("PODMAN_COMPOSE_PROVIDER", "/usr/bin/podman-compose");
    }
    command
}
