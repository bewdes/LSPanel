use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub repository: bool,
    pub branch: String,
    pub dirty: bool,
    pub changed_files: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub relative_date: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDetails {
    pub branches: Vec<String>,
    pub commits: Vec<GitCommit>,
    pub changes: Vec<GitChange>,
    pub remote_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub status: String,
    pub path: String,
}

pub fn status(directory: &str) -> Result<GitStatus, String> {
    let path = Path::new(directory);
    if !path.is_dir() {
        return Err("Project directory does not exist".into());
    }
    if !path.join(".git").exists() {
        return Ok(GitStatus {
            repository: false,
            branch: String::new(),
            dirty: false,
            changed_files: 0,
        });
    }
    let output = crate::process::output(
        Command::new("git")
            .args(["status", "--porcelain=v1", "--branch"])
            .current_dir(path)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Git status",
    )?;
    if !output.status.success() {
        return Err(crate::security::redact(
            String::from_utf8_lossy(&output.stderr).trim(),
            Vec::new(),
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut lines = text.lines();
    let branch = lines
        .next()
        .and_then(|line| line.strip_prefix("## "))
        .unwrap_or("HEAD")
        .split("...")
        .next()
        .unwrap_or("HEAD")
        .to_owned();
    let changed_files = lines.count();
    Ok(GitStatus {
        repository: true,
        branch,
        dirty: changed_files > 0,
        changed_files,
    })
}

pub fn action(directory: &str, action: &str, message: &str) -> Result<GitStatus, String> {
    let path = Path::new(directory);
    if !path.join(".git").is_dir() {
        return Err("This project is not a Git repository".into());
    }
    match action {
        "fetch" => run(path, &["fetch", "--prune"])?,
        "pull" => run(path, &["pull", "--ff-only"])?,
        "push" => run(path, &["push"])?,
        "commit" => {
            let message = message.trim();
            if message.is_empty() {
                return Err("Commit message is required".into());
            }
            run(path, &["add", "-A"])?;
            run(path, &["commit", "-m", message])?
        }
        _ => return Err("Unsupported Git action".into()),
    }
    status(directory)
}
fn run(directory: &Path, args: &[&str]) -> Result<(), String> {
    let network = args
        .first()
        .is_some_and(|action| matches!(*action, "fetch" | "pull" | "push"));
    let output = crate::process::output(
        Command::new("git")
            .args(args)
            .current_dir(directory)
            .stdin(Stdio::null()),
        if network {
            crate::process::NETWORK_TIMEOUT
        } else {
            crate::process::SHORT_TIMEOUT
        },
        "Git command",
    )?;
    if output.status.success() {
        Ok(())
    } else {
        let detail = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        Err(if detail.trim().is_empty() {
            "Git command failed".into()
        } else {
            crate::security::redact(detail.trim(), Vec::new())
        })
    }
}

pub fn details(directory: &str) -> Result<GitDetails, String> {
    let path = Path::new(directory);
    if !path.join(".git").is_dir() {
        return Err("This project is not a Git repository".into());
    }
    let branches_output = crate::process::output(
        Command::new("git")
            .args(["branch", "--format=%(refname:short)"])
            .current_dir(path)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Git branch list",
    )?;
    if !branches_output.status.success() {
        return Err(crate::security::redact(
            String::from_utf8_lossy(&branches_output.stderr).trim(),
            Vec::new(),
        ));
    }
    let branches = String::from_utf8_lossy(&branches_output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect();
    let history = crate::process::output(
        Command::new("git")
            .args(["log", "-n", "20", "--pretty=format:%h%x1f%s%x1f%an%x1f%ar"])
            .current_dir(path)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Git history",
    )?;
    let commits = if history.status.success() {
        String::from_utf8_lossy(&history.stdout)
            .lines()
            .filter_map(|line| {
                let mut fields = line.split('\u{1f}');
                Some(GitCommit {
                    hash: fields.next()?.into(),
                    subject: fields.next()?.into(),
                    author: fields.next()?.into(),
                    relative_date: fields.next()?.into(),
                })
            })
            .collect()
    } else {
        Vec::new()
    };
    let changes_output = crate::process::output(
        Command::new("git")
            .args(["status", "--porcelain=v1", "--untracked-files=all"])
            .current_dir(path)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Git changes",
    )?;
    let changes = if changes_output.status.success() {
        String::from_utf8_lossy(&changes_output.stdout)
            .lines()
            .filter_map(|line| {
                if line.len() < 4 {
                    return None;
                }
                Some(GitChange {
                    status: line[..2].trim().to_owned(),
                    path: line[3..].trim().trim_matches('"').to_owned(),
                })
            })
            .collect()
    } else {
        Vec::new()
    };
    Ok(GitDetails {
        branches,
        commits,
        changes,
        remote_url: repository_url(directory).ok(),
    })
}

pub fn repository_url(directory: &str) -> Result<String, String> {
    let path = Path::new(directory);
    if !path.join(".git").is_dir() {
        return Err("This project is not a Git repository".into());
    }
    let output = crate::process::output(
        Command::new("git")
            .args(["config", "--get", "remote.origin.url"])
            .current_dir(path)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "Git remote",
    )?;
    if !output.status.success() {
        return Err("This repository has no origin remote".into());
    }
    browser_url(String::from_utf8_lossy(&output.stdout).trim())
}

fn browser_url(remote: &str) -> Result<String, String> {
    if remote.is_empty() || remote.chars().any(char::is_whitespace) {
        return Err("Git remote URL is invalid".into());
    }
    let value = if let Some(rest) = remote.strip_prefix("git@") {
        let (host, path) = rest
            .split_once(':')
            .ok_or("Unsupported Git SSH remote URL")?;
        format!("https://{host}/{}", path.trim_end_matches(".git"))
    } else if let Some(rest) = remote.strip_prefix("ssh://") {
        let (authority, path) = rest
            .split_once('/')
            .ok_or("Unsupported Git SSH remote URL")?;
        let host = authority
            .rsplit_once('@')
            .map_or(authority, |(_, host)| host);
        if host.contains(':') {
            return Err("Git SSH remotes with custom ports cannot be opened automatically".into());
        }
        format!("https://{host}/{}", path.trim_end_matches(".git"))
    } else if remote.starts_with("https://") || remote.starts_with("http://") {
        let authority = remote
            .split("://")
            .nth(1)
            .unwrap_or_default()
            .split('/')
            .next()
            .unwrap_or_default();
        if authority.contains('@') {
            return Err("Git remote URLs containing credentials are not allowed".into());
        }
        remote.trim_end_matches(".git").to_owned()
    } else {
        return Err("Only HTTP(S) and SSH Git remotes can be opened".into());
    };
    let host = value
        .split("://")
        .nth(1)
        .unwrap_or_default()
        .split('/')
        .next()
        .unwrap_or_default();
    if host.is_empty()
        || !host
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '.' | '-'))
    {
        return Err("Git remote host is invalid".into());
    }
    Ok(value)
}

pub fn initialize(directory: &str, project_type: &str) -> Result<GitStatus, String> {
    let path = Path::new(directory);
    if !path.is_dir() {
        return Err("Project directory does not exist".into());
    }
    if path.join(".git").exists() {
        return Err("This project is already a Git repository".into());
    }
    let ignore_path = path.join(".gitignore");
    let mut created_ignore = false;
    if !ignore_path.exists() {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&ignore_path)
            .map_err(|error| format!("Failed to create .gitignore: {error}"))?;
        file.write_all(gitignore_template(project_type).as_bytes())
            .map_err(|error| {
                let _ = fs::remove_file(&ignore_path);
                format!("Failed to write .gitignore: {error}")
            })?;
        created_ignore = true;
    }
    if let Err(error) = run(path, &["init"]) {
        if created_ignore {
            let _ = fs::remove_file(ignore_path);
        }
        return Err(error);
    }
    status(directory)
}

fn gitignore_template(project_type: &str) -> &'static str {
    match project_type {
        "node" | "react" => {
            "node_modules/\ndist/\nbuild/\n.env\n.env.*\n!.env.example\n*.log\n.DS_Store\n.lspanel/\n"
        }
        "wordpress" => {
            ".env\n.env.*\n!.env.example\nwp-content/uploads/\nwp-content/cache/\n*.log\n.DS_Store\n.lspanel/\n"
        }
        "laravel" => {
            "/vendor/\n/node_modules/\n/public/build/\n/storage/*.key\n.env\n.env.*\n!.env.example\n*.log\n.DS_Store\n.lspanel/\n"
        }
        "symfony" => {
            "/vendor/\n/var/\n/node_modules/\n/public/build/\n.env.local\n.env.*.local\n*.log\n.DS_Store\n.lspanel/\n"
        }
        _ => ".env\n.env.*\n!.env.example\n/vendor/\n/node_modules/\n*.log\n.DS_Store\n.lspanel/\n",
    }
}

pub fn checkout(directory: &str, branch: &str, create: bool) -> Result<GitStatus, String> {
    let path = Path::new(directory);
    if !path.join(".git").is_dir() {
        return Err("This project is not a Git repository".into());
    }
    let branch = branch.trim();
    if branch.is_empty() || branch.starts_with('-') || branch.len() > 200 {
        return Err("Enter a valid branch name".into());
    }
    run(path, &["check-ref-format", "--branch", branch])?;
    if create {
        run(path, &["switch", "-c", branch])?
    } else {
        run(path, &["switch", branch])?
    }
    status(directory)
}

#[cfg(test)]
mod tests {
    use super::{browser_url, gitignore_template};

    #[test]
    fn templates_ignore_secrets_and_runtime_dependencies() {
        assert!(gitignore_template("react").contains("node_modules/"));
        assert!(gitignore_template("laravel").contains("/vendor/"));
        assert!(gitignore_template("wordpress").contains("wp-content/uploads/"));
        assert!(gitignore_template("php").contains(".env"));
        assert!(gitignore_template("php").contains("!.env.example"));
        for project_type in ["node", "react", "wordpress", "laravel", "symfony", "php"] {
            assert!(
                gitignore_template(project_type).contains(".lspanel/"),
                "{project_type} must ignore .lspanel/, which holds container secrets and database dumps"
            );
        }
    }

    #[test]
    fn converts_safe_git_remotes_to_browser_urls() {
        assert_eq!(
            browser_url("git@github.com:owner/project.git").unwrap(),
            "https://github.com/owner/project"
        );
        assert_eq!(
            browser_url("ssh://git@gitlab.com/group/project.git").unwrap(),
            "https://gitlab.com/group/project"
        );
        assert!(browser_url("https://user:token@example.com/project.git").is_err());
        assert!(browser_url("file:///tmp/project").is_err());
    }
}
