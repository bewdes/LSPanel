use std::{path::Path, process::Stdio};

use serde::Serialize;
use tauri::Emitter;

use crate::container_runtime::command as runtime_command;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentProgress {
    id: String,
    progress: u8,
    stage: String,
    indeterminate: bool,
}

pub(crate) fn emit_progress(app: &tauri::AppHandle, id: &str, progress: u8, stage: &str) {
    let _ = crate::operations::progress_for_environment(app, id, progress, stage);
    let _ = app.emit(
        "environment-progress",
        EnvironmentProgress {
            id: id.into(),
            progress,
            stage: stage.into(),
            indeterminate: false,
        },
    );
}

pub(crate) fn pull_images(
    app: &tauri::AppHandle,
    id: &str,
    executable: &str,
    directory: &Path,
) -> Result<(), String> {
    let child = runtime_command(executable)
        .args(["compose", "pull"])
        .current_dir(directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let secrets = crate::security::environment_secrets(app, id);
    let mut messages = Vec::new();
    let status = crate::process::stream_stderr(
        child,
        crate::process::CONTAINER_TIMEOUT,
        "container image download",
        |line| {
            let clean = line
                .chars()
                .filter(|character| !character.is_control())
                .collect::<String>();
            let clean = crate::security::redact(clean.trim(), secrets.clone());
            if clean.is_empty() {
                return;
            }
            if messages.len() >= 30 {
                messages.remove(0);
            }
            messages.push(clean);
        },
    )?;
    if status.success() {
        emit_progress(app, id, 70, "Container images are ready");
        Ok(())
    } else {
        Err(if messages.is_empty() {
            "Failed to download container images".into()
        } else {
            messages.join("\n")
        })
    }
}

pub(crate) fn run_compose(
    app: &tauri::AppHandle,
    id: &str,
    executable: &str,
    directory: &Path,
    args: &[&str],
) -> Result<String, String> {
    let mut command = runtime_command(executable);
    if crate::settings::load(app)
        .ok()
        .flatten()
        .is_some_and(|settings| settings.docker_buildkit_enabled)
    {
        command
            .env("DOCKER_BUILDKIT", "1")
            .env("COMPOSE_DOCKER_CLI_BUILD", "1");
    }
    let child = command
        .args(args)
        .current_dir(directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let secrets = crate::security::environment_secrets(app, id);
    let mut messages = Vec::new();
    let mut live_progress = 75u8;
    let mut last_stage = String::new();
    let status = crate::process::stream_stderr(
        child,
        crate::process::CONTAINER_TIMEOUT,
        "Compose operation",
        |line| {
            let clean = line
                .chars()
                .filter(|character| !character.is_control())
                .collect::<String>();
            let clean = crate::security::redact(clean.trim(), secrets.clone());
            if clean.is_empty() {
                return;
            }
            if let Some(stage) = progress_stage(&clean) {
                if stage != last_stage {
                    live_progress = live_progress.saturating_add(1).min(84);
                    emit_progress(app, id, live_progress, stage);
                    last_stage = stage.into();
                }
            }
            if messages.len() >= 50 {
                messages.remove(0);
            }
            messages.push(clean);
        },
    )?;
    let output = messages.join("\n");
    if status.success() {
        Ok(output)
    } else {
        Err(if output.is_empty() {
            "Compose operation failed".into()
        } else {
            output
        })
    }
}

pub(crate) fn progress_stage(line: &str) -> Option<&'static str> {
    let line = line.to_ascii_lowercase();
    if line.contains("load build definition") || line.contains("building") {
        Some("Preparing container build")
    } else if line.contains("running") && line.contains("install") {
        Some("Installing image dependencies")
    } else if line.contains("exporting") || line.contains("writing image") {
        Some("Saving container image")
    } else if line.contains("creating") || line.contains("recreate") {
        Some("Creating service containers")
    } else if line.contains("starting") {
        Some("Starting service containers")
    } else if line.contains("waiting") {
        Some("Waiting for service health checks")
    } else if line.contains("healthy") {
        Some("Service health checks passed")
    } else if line.contains("started") || line.contains("running") {
        Some("Services are running")
    } else {
        None
    }
}

pub(crate) fn action_args(action: &str) -> Option<&'static [&'static str]> {
    match action {
        "start" => Some(&["compose", "up", "-d"]),
        "rebuild" => Some(&["compose", "up", "-d", "--build", "--force-recreate"]),
        "stop" => Some(&["compose", "stop"]),
        "kill" => Some(&["compose", "kill"]),
        "pause" => Some(&["compose", "pause"]),
        "unpause" => Some(&["compose", "unpause"]),
        // Compose configuration is regenerated before every operation. Recreate
        // containers so network aliases and other edited settings actually
        // take effect instead of restarting the old container definitions.
        "restart" => Some(&["compose", "up", "-d", "--force-recreate"]),
        "destroy" => Some(&["compose", "down", "--volumes", "--remove-orphans"]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{action_args, progress_stage};

    #[test]
    fn translates_compose_output_into_live_progress_stages() {
        assert_eq!(
            progress_stage("#12 exporting to image"),
            Some("Saving container image")
        );
        assert_eq!(
            progress_stage("Container demo-web  Starting"),
            Some("Starting service containers")
        );
        assert_eq!(
            progress_stage("Container demo-db  Healthy"),
            Some("Service health checks passed")
        );
        assert_eq!(progress_stage("ordinary application output"), None);
    }

    #[test]
    fn lifecycle_actions_map_to_expected_compose_commands() {
        assert_eq!(action_args("start"), Some(&["compose", "up", "-d"][..]));
        assert_eq!(action_args("stop"), Some(&["compose", "stop"][..]));
        assert_eq!(
            action_args("restart"),
            Some(&["compose", "up", "-d", "--force-recreate"][..])
        );
        assert_eq!(
            action_args("destroy"),
            Some(&["compose", "down", "--volumes", "--remove-orphans"][..])
        );
        assert_eq!(action_args("unknown"), None);
    }
}
