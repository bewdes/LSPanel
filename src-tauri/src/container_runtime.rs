use serde::Serialize;
use std::{
    path::PathBuf,
    process::{Command, Stdio},
};

/// Every location `podman-compose` (a separate Python package, not something
/// Podman itself ships) is commonly installed to: the system package
/// manager's paths, Homebrew on both Apple Silicon and Linux, and a
/// per-user `pip install --user` / `pipx install` (pipx's default target is
/// `~/.local/bin`, and that's also where a plain `pip install --user` puts
/// console scripts).
fn podman_compose_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/usr/bin/podman-compose"),
        PathBuf::from("/usr/local/bin/podman-compose"),
        PathBuf::from("/opt/homebrew/bin/podman-compose"),
        PathBuf::from("/home/linuxbrew/.linuxbrew/bin/podman-compose"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        candidates.push(PathBuf::from(home).join(".local/bin/podman-compose"));
    }
    candidates
}

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

/// Reports the status of every known container runtime (Docker, Podman)
/// individually, rather than collapsing them into a single "best" result —
/// used by onboarding so the user can see exactly which one is missing.
pub fn detect_each() -> Vec<RuntimeStatus> {
    ["docker", "podman"]
        .into_iter()
        .map(|runtime| {
            inspect(runtime).unwrap_or_else(|| RuntimeStatus {
                runtime: Some(runtime.into()),
                installed: false,
                running: false,
                version: None,
                compose_available: false,
                message: format!(
                    "{} not found",
                    if runtime == "podman" {
                        "Podman"
                    } else {
                        "Docker"
                    }
                ),
            })
        })
        .collect()
}

fn score(status: &RuntimeStatus) -> u8 {
    u8::from(status.installed)
        + u8::from(status.running) * 2
        + u8::from(status.compose_available) * 4
}

fn inspect(runtime: &str) -> Option<RuntimeStatus> {
    // `docker version --format ...` contacts both the client and the daemon.
    // It exits with code 1 when Docker is installed but the current user does
    // not yet have access to docker.sock, which previously made onboarding
    // incorrectly report the client as not installed. `--version` is a pure
    // client-side presence check; daemon access is assessed separately below.
    let version_output = crate::process::output(
        command(runtime).arg("--version").stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "container runtime version",
    )
    .ok()?;
    if !version_output.status.success() {
        return None;
    }
    let version = client_version(runtime, &String::from_utf8_lossy(&version_output.stdout));
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
        && podman_compose_candidates()
            .iter()
            .any(|provider| provider.is_file());
    let compose_available = integrated_compose || external_compose;

    Some(RuntimeStatus {
        runtime: Some(runtime.into()),
        installed: true,
        running,
        version,
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

fn client_version(runtime: &str, output: &str) -> Option<String> {
    let output = output.trim();
    if output.is_empty() {
        return None;
    }
    if runtime == "docker" {
        return output
            .strip_prefix("Docker version ")
            .and_then(|value| value.split(',').next())
            .map(str::to_owned)
            .or_else(|| Some(output.to_owned()));
    }
    output
        .strip_prefix("podman version ")
        .or_else(|| output.strip_prefix("podman version"))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or_else(|| Some(output.to_owned()))
}

pub(crate) fn command(runtime: &str) -> Command {
    let mut command = Command::new(runtime);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    // LD_LIBRARY_PATH/LD_PRELOAD are stripped because a Snap-launched LS
    // Panel inherits Snap's own confinement values, which don't apply to the
    // system `docker`/`podman` binary and can break it with a symbol lookup
    // error. DOCKER_HOST/CONTAINER_HOST are deliberately left alone: they're
    // the standard way to point the CLI at a non-default local socket
    // (Colima, rootless Podman, custom Docker contexts), and rootless
    // Podman in particular often *requires* CONTAINER_HOST to be set
    // explicitly for a GUI-launched app that never sourced the user's
    // login shell profile.
    command
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("LD_PRELOAD");
    if runtime.ends_with("podman") {
        if let Some(provider) = podman_compose_candidates()
            .into_iter()
            .find(|path| path.is_file())
        {
            command.env("PODMAN_COMPOSE_PROVIDER", provider);
        }
    }
    command
}

#[cfg(test)]
mod tests {
    use super::{client_version, podman_compose_candidates};

    #[test]
    fn parses_client_only_runtime_versions() {
        assert_eq!(
            client_version("docker", "Docker version 29.7.1, build e9452d6\n").as_deref(),
            Some("29.7.1")
        );
        assert_eq!(
            client_version("podman", "podman version 5.4.2\n").as_deref(),
            Some("5.4.2")
        );
    }

    #[test]
    fn podman_compose_candidates_cover_homebrew_and_per_user_installs() {
        // Regression test: detection originally only checked /usr/bin and
        // /usr/local/bin, missing Apple Silicon/Linuxbrew Homebrew and a
        // `pip install --user` / `pipx install` (both default to
        // ~/.local/bin), which is how podman-compose is very commonly
        // installed since it isn't part of Podman itself.
        let candidates = podman_compose_candidates()
            .into_iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>();
        assert!(candidates.contains(&"/usr/bin/podman-compose".to_owned()));
        assert!(candidates.contains(&"/usr/local/bin/podman-compose".to_owned()));
        assert!(candidates.contains(&"/opt/homebrew/bin/podman-compose".to_owned()));
        assert!(candidates.contains(&"/home/linuxbrew/.linuxbrew/bin/podman-compose".to_owned()));
        if std::env::var_os("HOME").is_some() {
            assert!(candidates
                .iter()
                .any(|path| path.ends_with(".local/bin/podman-compose")));
        }
    }
}
