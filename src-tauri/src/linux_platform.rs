use std::path::Path;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PackageManager {
    Apt,
    Dnf,
    Pacman,
    Zypper,
    Apk,
}

impl PackageManager {
    pub fn name(self) -> &'static str {
        match self {
            Self::Apt => "apt",
            Self::Dnf => "dnf",
            Self::Pacman => "pacman",
            Self::Zypper => "zypper",
            Self::Apk => "apk",
        }
    }

    fn binary(self) -> &'static str {
        match self {
            Self::Apt => "/usr/bin/apt-get",
            Self::Dnf => "/usr/bin/dnf",
            Self::Pacman => "/usr/bin/pacman",
            Self::Zypper => "/usr/bin/zypper",
            Self::Apk => "/sbin/apk",
        }
    }

    pub fn install_command(self, packages: &str) -> String {
        match self {
            Self::Apt => format!(
                "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y {packages}"
            ),
            Self::Dnf => format!("dnf install -y {packages}"),
            Self::Pacman => format!("pacman -S --noconfirm --needed {packages}"),
            Self::Zypper => format!("zypper --non-interactive install {packages}"),
            Self::Apk => format!("apk add --no-cache {packages}"),
        }
    }
}

#[derive(Clone, Debug)]
pub struct LinuxPlatform {
    pub id: String,
    pub name: String,
    pub id_like: Vec<String>,
    pub package_manager: PackageManager,
}

impl LinuxPlatform {
    pub fn detect() -> Result<Self, String> {
        let release = std::fs::read_to_string("/etc/os-release")
            .map_err(|error| format!("Failed to read /etc/os-release: {error}"))?;
        Self::from_release(&release, |manager| Path::new(manager.binary()).is_file())
    }

    fn from_release(
        release: &str,
        available: impl Fn(PackageManager) -> bool,
    ) -> Result<Self, String> {
        let value = |key: &str| {
            release.lines().find_map(|line| {
                let (candidate, value) = line.split_once('=')?;
                (candidate == key).then(|| value.trim().trim_matches(['\'', '"']).to_owned())
            })
        };
        let id = value("ID")
            .unwrap_or_else(|| "linux".into())
            .to_ascii_lowercase();
        let name = value("PRETTY_NAME")
            .or_else(|| value("NAME"))
            .unwrap_or_else(|| id.clone());
        let id_like = value("ID_LIKE")
            .unwrap_or_default()
            .split_whitespace()
            .map(|item| item.to_ascii_lowercase())
            .collect::<Vec<_>>();
        let family = std::iter::once(id.as_str())
            .chain(id_like.iter().map(String::as_str))
            .collect::<Vec<_>>();
        let preferred = if family.iter().any(|id| matches!(*id, "debian" | "ubuntu")) {
            PackageManager::Apt
        } else if family
            .iter()
            .any(|id| matches!(*id, "fedora" | "rhel" | "centos"))
        {
            PackageManager::Dnf
        } else if family.iter().any(|id| matches!(*id, "arch" | "manjaro")) {
            PackageManager::Pacman
        } else if family.iter().any(|id| matches!(*id, "suse" | "opensuse")) {
            PackageManager::Zypper
        } else if family.contains(&"alpine") {
            PackageManager::Apk
        } else {
            [
                PackageManager::Apt,
                PackageManager::Dnf,
                PackageManager::Pacman,
                PackageManager::Zypper,
                PackageManager::Apk,
            ]
            .into_iter()
            .find(|manager| available(*manager))
            .ok_or("No supported package manager was found")?
        };
        if !available(preferred) {
            return Err(format!(
                "{} was detected, but its {} package manager is unavailable",
                name,
                preferred.name()
            ));
        }
        Ok(Self {
            id,
            name,
            id_like,
            package_manager: preferred,
        })
    }

    pub fn is_family(&self, ids: &[&str]) -> bool {
        ids.contains(&self.id.as_str())
            || self.id_like.iter().any(|item| ids.contains(&item.as_str()))
    }

    pub fn docker_uses_official_script(&self) -> bool {
        self.is_family(&["debian", "ubuntu", "fedora", "rhel", "centos"])
    }

    pub fn start_docker_command(&self) -> &'static str {
        if self.id == "alpine" {
            "rc-update add docker default && rc-service docker start"
        } else {
            "systemctl enable --now docker"
        }
    }

    pub fn add_docker_group_command(&self, quoted_user: &str) -> String {
        if self.id == "alpine" {
            format!("addgroup {quoted_user} docker")
        } else {
            format!("usermod -aG docker {quoted_user}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LinuxPlatform, PackageManager};

    fn detect(release: &str, expected: PackageManager) -> LinuxPlatform {
        LinuxPlatform::from_release(release, |manager| manager == expected).unwrap()
    }

    #[test]
    fn maps_distribution_families_to_package_managers() {
        assert_eq!(
            detect("ID=ubuntu\nPRETTY_NAME=Ubuntu\n", PackageManager::Apt).package_manager,
            PackageManager::Apt
        );
        assert_eq!(
            detect(
                "ID=rocky\nID_LIKE=\"rhel centos fedora\"\n",
                PackageManager::Dnf
            )
            .package_manager,
            PackageManager::Dnf
        );
        assert_eq!(
            detect("ID=manjaro\nID_LIKE=arch\n", PackageManager::Pacman).package_manager,
            PackageManager::Pacman
        );
        assert_eq!(
            detect(
                "ID=opensuse-tumbleweed\nID_LIKE=suse\n",
                PackageManager::Zypper
            )
            .package_manager,
            PackageManager::Zypper
        );
        assert_eq!(
            detect("ID=alpine\n", PackageManager::Apk).package_manager,
            PackageManager::Apk
        );
    }
}
