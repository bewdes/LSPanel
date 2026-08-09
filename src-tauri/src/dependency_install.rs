use serde::Serialize;
use std::{
    io::{BufRead, BufReader, Read},
    path::Path,
    process::{Command, Stdio},
};
use tauri::Emitter;

use crate::linux_platform::{LinuxPlatform, PackageManager};

const NVM_INSTALL_URL: &str = "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh";

/// Installs one of the explicitly supported host dependencies. The tool id is
/// matched against a closed allow-list; no command or package name supplied by
/// the webview is ever interpolated into a privileged shell command.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub tool: String,
    pub title: String,
    pub platform: String,
    pub package_manager: String,
    pub commands: Vec<String>,
    pub requires_admin: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallProgress {
    tool: String,
    stage: String,
    message: String,
}

struct PlannedCommand {
    script: String,
    privileged: bool,
}

pub fn plan(tool: &str) -> Result<InstallPlan, String> {
    let platform = LinuxPlatform::detect()?;
    let commands = planned_commands(tool, &platform)?;
    Ok(InstallPlan {
        tool: tool.into(),
        title: title_for(tool).into(),
        platform: platform.name,
        package_manager: platform.package_manager.name().into(),
        commands: commands.iter().map(display_command).collect(),
        requires_admin: commands.iter().any(|command| command.privileged),
    })
}

pub fn install(app: &tauri::AppHandle, tool: &str) -> Result<String, String> {
    let platform = LinuxPlatform::detect()?;
    let commands = planned_commands(tool, &platform)?;
    emit(
        app,
        tool,
        "starting",
        &format!("Installing {}", title_for(tool)),
    );
    for command in commands {
        emit(app, tool, "command", &display_command(&command));
        run_shell(app, tool, &command.script, command.privileged)?;
    }
    let message = format!("{} installed", title_for(tool));
    emit(app, tool, "finished", &message);
    Ok(message)
}

fn planned_commands(tool: &str, platform: &LinuxPlatform) -> Result<Vec<PlannedCommand>, String> {
    let commands = match tool {
        "docker" => {
            let install = if platform.docker_uses_official_script() {
                let prerequisites =
                    package_install_command(platform, packages_for(platform, "download")?);
                format!(
                    "{prerequisites} \
&& curl -fsSL https://get.docker.com -o /tmp/lspanel-get-docker.sh \
&& sh /tmp/lspanel-get-docker.sh \
&& rm -f /tmp/lspanel-get-docker.sh"
                )
            } else {
                package_install_command(platform, packages_for(platform, "docker")?)
            };
            vec![
                privileged(format!("{install} && {}", platform.start_docker_command())),
                privileged(docker_access_script(platform)?),
            ]
        }
        "docker-access" => vec![privileged(docker_access_script(platform)?)],
        "podman" => vec![package_command(platform, "podman")?],
        "git" => vec![
            package_command(platform, "git")?,
            user(format!("curl -fsSL {NVM_INSTALL_URL} | bash")),
        ],
        "openssl" => vec![package_command(platform, "openssl")?],
        "nss-tools" => vec![package_command(platform, "nss-tools")?],
        "cloudflare" => vec![privileged(cloudflared_install_command(platform)?)],
        "tailscale" => vec![privileged(
            "curl -fsSL https://tailscale.com/install.sh | sh".into(),
        )],
        "ngrok" => {
            if platform.package_manager != PackageManager::Apt {
                return Err("Automatic ngrok installation is only available on apt systems".into());
            }
            vec![privileged(
                "curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
| tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null \
&& echo 'deb https://ngrok-agent.s3.amazonaws.com bookworm main' \
| tee /etc/apt/sources.list.d/ngrok.list >/dev/null \
&& apt-get update && apt-get install -y ngrok"
                    .into(),
            )]
        }
        _ => return Err("Automatic installation is not supported for this tool".into()),
    };
    Ok(commands)
}

fn title_for(tool: &str) -> &str {
    match tool {
        "docker" => "Docker",
        "docker-access" => "Docker socket access",
        "podman" => "Podman and Compose",
        "git" => "Git, GitHub CLI, npm and NVM",
        "openssl" => "OpenSSL",
        "nss-tools" => "NSS tools",
        "cloudflare" => "Cloudflare Tunnel",
        "tailscale" => "Tailscale",
        "ngrok" => "ngrok",
        _ => "dependency",
    }
}

fn package_command(platform: &LinuxPlatform, tool: &str) -> Result<PlannedCommand, String> {
    Ok(privileged(package_install_command(
        platform,
        packages_for(platform, tool)?,
    )))
}

fn privileged(script: String) -> PlannedCommand {
    PlannedCommand {
        script,
        privileged: true,
    }
}

fn user(script: String) -> PlannedCommand {
    PlannedCommand {
        script,
        privileged: false,
    }
}

fn display_command(command: &PlannedCommand) -> String {
    if command.privileged && !running_as_root() {
        format!(
            "pkexec /bin/sh -c {}",
            crate::shell::shell_quote(&command.script)
        )
    } else {
        format!("/bin/sh -c {}", crate::shell::shell_quote(&command.script))
    }
}

fn package_install_command(platform: &LinuxPlatform, packages: &str) -> String {
    platform.package_manager.install_command(packages)
}

fn packages_for(platform: &LinuxPlatform, tool: &str) -> Result<&'static str, String> {
    let packages = match (platform.package_manager, tool) {
        (_, "podman") => "podman podman-compose",
        (PackageManager::Apt | PackageManager::Dnf | PackageManager::Zypper, "git") => {
            "git gh npm curl ca-certificates"
        }
        (PackageManager::Pacman | PackageManager::Apk, "git") => {
            "git github-cli npm curl ca-certificates"
        }
        (_, "download") => "curl ca-certificates",
        (PackageManager::Pacman | PackageManager::Zypper, "docker") => "docker docker-compose",
        (PackageManager::Apk, "docker") => "docker docker-cli-compose",
        (_, "acl") => "acl",
        (_, "openssl") => "openssl",
        (PackageManager::Apt, "nss-tools") => "libnss3-tools",
        (PackageManager::Dnf, "nss-tools") => "nss-tools",
        (PackageManager::Pacman, "nss-tools") => "nss",
        (PackageManager::Zypper, "nss-tools") => "mozilla-nss-tools",
        (PackageManager::Apk, "nss-tools") => "nss-tools",
        _ => return Err("Unsupported dependency package".into()),
    };
    Ok(packages)
}

fn cloudflared_install_command(platform: &LinuxPlatform) -> Result<String, String> {
    Ok(match platform.package_manager {
        PackageManager::Apt => {
            "install -d -m 0755 /usr/share/keyrings \
&& curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
| tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null \
&& echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
| tee /etc/apt/sources.list.d/cloudflared.list >/dev/null \
&& apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y cloudflared"
                .into()
        }
        PackageManager::Dnf => {
            "curl -fsSL https://pkg.cloudflare.com/cloudflared.repo \
| tee /etc/yum.repos.d/cloudflared.repo >/dev/null \
&& dnf install -y cloudflared"
                .into()
        }
        PackageManager::Pacman => "pacman -Syu --noconfirm --needed cloudflared".into(),
        PackageManager::Zypper | PackageManager::Apk => {
            let prerequisites =
                package_install_command(platform, packages_for(platform, "download")?);
            format!(
                "{prerequisites} \
&& machine=$(uname -m) \
&& case \"$machine\" in \
x86_64) asset=amd64 ;; aarch64|arm64) asset=arm64 ;; armv7l|armv7) asset=arm ;; \
*) echo \"Unsupported CPU architecture: $machine\" >&2; exit 1 ;; esac \
&& curl -fL \"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$asset\" -o /tmp/lspanel-cloudflared \
&& install -m 0755 /tmp/lspanel-cloudflared /usr/local/bin/cloudflared \
&& rm -f /tmp/lspanel-cloudflared"
            )
        }
    })
}

fn docker_access_script(platform: &LinuxPlatform) -> Result<String, String> {
    let user = current_username()?;
    let prerequisites = if ["/usr/bin/setfacl", "/bin/setfacl"]
        .iter()
        .any(|path| Path::new(path).is_file())
    {
        String::new()
    } else {
        format!(
            "{} && ",
            package_install_command(platform, packages_for(platform, "acl")?)
        )
    };
    let group_command = platform.add_docker_group_command(&crate::shell::shell_quote(&user));
    Ok(format!(
        "{prerequisites}{group_command} \
&& if [ -S /var/run/docker.sock ]; then setfacl -m u:{user}:rw /var/run/docker.sock; fi",
        user = crate::shell::shell_quote(&user)
    ))
}

fn current_username() -> Result<String, String> {
    let output = Command::new("id")
        .arg("-un")
        .output()
        .map_err(|error| format!("Failed to determine the current user: {error}"))?;
    let user = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if user.is_empty()
        || user.starts_with('-')
        || !user.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
        })
    {
        return Err("The current user name is not safe for Docker group configuration".into());
    }
    Ok(user)
}

fn run_shell(
    app: &tauri::AppHandle,
    tool: &str,
    script: &str,
    privileged: bool,
) -> Result<(), String> {
    let mut command = if privileged && !running_as_root() {
        if !Path::new("/usr/bin/pkexec").is_file() {
            return Err("Administrator authorization is unavailable (pkexec was not found)".into());
        }
        let mut command = Command::new("/usr/bin/pkexec");
        command.args(["/bin/sh", "-c", script]);
        command
    } else {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", script]);
        command
    };
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start dependency installer: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Installer stdout is unavailable")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Installer stderr is unavailable")?;
    let output_reader = read_stream(app.clone(), tool.into(), stdout, "output");
    let error_reader = read_stream(app.clone(), tool.into(), stderr, "error");
    let status = child.wait().map_err(|error| error.to_string())?;
    let _ = output_reader.join();
    let errors = error_reader.join().unwrap_or_default();

    if status.success() {
        return Ok(());
    }
    let detail = if errors.trim().is_empty() {
        format!("installer exited with {status}")
    } else {
        errors.trim().to_owned()
    };
    let message = format!("Dependency installation failed: {detail}");
    emit(app, tool, "failed", &message);
    Err(message)
}

fn read_stream<R: Read + Send + 'static>(
    app: tauri::AppHandle,
    tool: String,
    stream: R,
    stage: &'static str,
) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut captured = Vec::new();
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                emit(&app, &tool, stage, &line);
                captured.push(line);
            }
        }
        captured.join("\n")
    })
}

fn emit(app: &tauri::AppHandle, tool: &str, stage: &str, message: &str) {
    let _ = app.emit(
        "dependency-install-progress",
        InstallProgress {
            tool: tool.into(),
            stage: stage.into(),
            message: message.into(),
        },
    );
}

fn running_as_root() -> bool {
    Command::new("id")
        .arg("-u")
        .output()
        .is_ok_and(|output| output.status.success() && output.stdout == b"0\n")
}

#[cfg(test)]
mod tests {
    use super::{packages_for, plan};
    use crate::linux_platform::LinuxPlatform;

    #[test]
    fn package_sets_include_every_requested_tool() {
        let platform = LinuxPlatform::detect().unwrap();
        let git = packages_for(&platform, "git").unwrap();
        assert!(git.contains("git"));
        assert!(git.contains("npm"));
        assert!(git.contains(
            if matches!(platform.package_manager.name(), "pacman" | "apk") {
                "github-cli"
            } else {
                "gh"
            }
        ));
        assert!(!packages_for(&platform, "podman").unwrap().is_empty());
        assert!(!packages_for(&platform, "openssl").unwrap().is_empty());
        assert!(!packages_for(&platform, "nss-tools").unwrap().is_empty());
    }

    #[test]
    fn unknown_packages_are_rejected() {
        let platform = LinuxPlatform::detect().unwrap();
        assert!(packages_for(&platform, "not-a-real-tool").is_err());
        assert!(plan("not-a-real-tool").is_err());
    }
}
