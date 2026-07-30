use std::path::Path;

/// Best-effort install command for a host dependency, shown to the user to
/// copy/run themselves (in their own terminal, with their own sudo prompt) —
/// LS Panel never executes package-manager or installer commands itself.
/// Returns `None` when no safe, verified command is known for the detected
/// package manager; callers should fall back to opening the project's
/// official install/download page in that case.
pub fn command_for(tool: &str) -> Option<String> {
    match tool {
        "docker" => Some("curl -fsSL https://get.docker.com | sh".into()),
        "tailscale" => Some("curl -fsSL https://tailscale.com/install.sh | sh".into()),
        "git" => package_command("git", "git", "git", "git"),
        "openssl" => package_command("openssl", "openssl", "openssl", "openssl"),
        "nss-tools" => package_command("libnss3-tools", "nss-tools", "nss", "mozilla-nss-tools"),
        "podman" => package_command("podman", "podman", "podman", "podman"),
        // ngrok only officially documents an apt repo for Debian/Ubuntu; other
        // package managers fall back to the download page (see command_for's
        // caller), since there's no verified equivalent command for them.
        "ngrok" if package_manager() == Some("apt") => Some(
            "curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
| sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null \
&& echo \"deb https://ngrok-agent.s3.amazonaws.com bookworm main\" \
| sudo tee /etc/apt/sources.list.d/ngrok.list \
&& sudo apt update \
&& sudo apt install ngrok"
                .into(),
        ),
        _ => None,
    }
}

fn package_manager() -> Option<&'static str> {
    [
        ("apt", "/usr/bin/apt-get"),
        ("dnf", "/usr/bin/dnf"),
        ("pacman", "/usr/bin/pacman"),
        ("zypper", "/usr/bin/zypper"),
    ]
    .into_iter()
    .find(|(_, binary)| Path::new(binary).is_file())
    .map(|(manager, _)| manager)
}

fn package_command(apt: &str, dnf: &str, pacman: &str, zypper: &str) -> Option<String> {
    match package_manager()? {
        "apt" => Some(format!("sudo apt-get install -y {apt}")),
        "dnf" => Some(format!("sudo dnf install -y {dnf}")),
        "pacman" => Some(format!("sudo pacman -S --noconfirm {pacman}")),
        "zypper" => Some(format!("sudo zypper install -y {zypper}")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::command_for;

    #[test]
    fn universal_installer_scripts_do_not_depend_on_a_package_manager() {
        assert_eq!(
            command_for("docker"),
            Some("curl -fsSL https://get.docker.com | sh".into())
        );
        assert_eq!(
            command_for("tailscale"),
            Some("curl -fsSL https://tailscale.com/install.sh | sh".into())
        );
    }

    #[test]
    fn unknown_tools_return_none() {
        assert_eq!(command_for("cloudflared"), None);
        assert_eq!(command_for("not-a-real-tool"), None);
    }

    #[test]
    fn ngrok_command_is_only_offered_for_apt_and_matches_the_official_repo_setup() {
        let command = command_for("ngrok");
        if super::package_manager() == Some("apt") {
            let command = command.expect("apt systems should get a verified ngrok command");
            assert!(command.contains("ngrok-agent.s3.amazonaws.com/ngrok.asc"));
            assert!(command.contains("/etc/apt/sources.list.d/ngrok.list"));
            assert!(command.contains("sudo apt install ngrok"));
        } else {
            assert_eq!(command, None);
        }
    }
}
