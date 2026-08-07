use serde::Serialize;
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    process::{Command, Stdio},
    sync::{LazyLock, Mutex},
};

static LOCKED_REPOSITORIES: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// Serializes mutating Git operations (fetch/pull/push/commit/checkout) on
/// the same repository. Without this, the unattended background
/// status-check fetch and a user-initiated action shell out to `git`
/// concurrently in the same `.git` directory with no coordination, which
/// can surface a confusing lock-file error on whichever side loses the
/// race instead of the actual problem.
struct RepositoryLock(String);

impl RepositoryLock {
    fn acquire(directory: &str) -> Result<Self, String> {
        let key = fs::canonicalize(directory)
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| directory.to_owned());
        let mut locked = LOCKED_REPOSITORIES
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if !locked.insert(key.clone()) {
            return Err("Another Git operation is already running for this project".into());
        }
        Ok(Self(key))
    }
}

impl Drop for RepositoryLock {
    fn drop(&mut self) {
        let mut locked = LOCKED_REPOSITORIES
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        locked.remove(&self.0);
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub repository: bool,
    pub branch: String,
    pub dirty: bool,
    pub changed_files: usize,
    pub ahead: usize,
    pub behind: usize,
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
            ahead: 0,
            behind: 0,
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
    let header = lines.next().unwrap_or("## HEAD");
    let branch = parse_branch_name(header);
    let (ahead, behind) = parse_ahead_behind(header);
    let changed_files = lines.count();
    Ok(GitStatus {
        repository: true,
        branch,
        dirty: changed_files > 0,
        changed_files,
        ahead,
        behind,
    })
}

/// A repository with no commits yet reports its branch header as
/// `## No commits yet on <branch>` (or, on older Git versions,
/// `## Initial commit on <branch>`) rather than the usual `## <branch>...`,
/// so the plain `## ` prefix strip alone would take the whole sentence as
/// the branch name right after "Initialize Git" on an empty project.
fn parse_branch_name(branch_header: &str) -> String {
    let after_prefix = branch_header.strip_prefix("## ").unwrap_or("HEAD");
    let name = after_prefix
        .strip_prefix("No commits yet on ")
        .or_else(|| after_prefix.strip_prefix("Initial commit on "))
        .unwrap_or(after_prefix);
    name.split("...").next().unwrap_or("HEAD").to_owned()
}

fn parse_ahead_behind(branch_header: &str) -> (usize, usize) {
    let Some(start) = branch_header.find('[') else {
        return (0, 0);
    };
    let Some(end) = branch_header[start..].find(']') else {
        return (0, 0);
    };
    let mut ahead = 0;
    let mut behind = 0;
    for part in branch_header[start + 1..start + end].split(", ") {
        if let Some(value) = part.strip_prefix("ahead ") {
            ahead = value.trim().parse().unwrap_or(0);
        } else if let Some(value) = part.strip_prefix("behind ") {
            behind = value.trim().parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

pub fn action(directory: &str, action: &str, message: &str) -> Result<GitStatus, String> {
    let _lock = RepositoryLock::acquire(directory)?;
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
            "node_modules/\ndist/\nbuild/\n.env\n.env.*\n!.env.example\n*.log\n.DS_Store\n"
        }
        "wordpress" => {
            ".env\n.env.*\n!.env.example\nwp-content/uploads/\nwp-content/cache/\n*.log\n.DS_Store\n"
        }
        "laravel" => {
            "/vendor/\n/node_modules/\n/public/build/\n/storage/*.key\n.env\n.env.*\n!.env.example\n*.log\n.DS_Store\n"
        }
        "symfony" => {
            "/vendor/\n/var/\n/node_modules/\n/public/build/\n.env.local\n.env.*.local\n*.log\n.DS_Store\n"
        }
        _ => ".env\n.env.*\n!.env.example\n/vendor/\n/node_modules/\n*.log\n.DS_Store\n",
    }
}

pub fn checkout(
    directory: &str,
    branch: &str,
    create: bool,
    stash: bool,
    force: bool,
) -> Result<GitStatus, String> {
    let _lock = RepositoryLock::acquire(directory)?;
    let path = Path::new(directory);
    if !path.join(".git").is_dir() {
        return Err("This project is not a Git repository".into());
    }
    if stash && force {
        return Err("Choose either stashing or discarding changes, not both".into());
    }
    let branch = branch.trim();
    if branch.is_empty() || branch.starts_with('-') || branch.len() > 200 {
        return Err("Enter a valid branch name".into());
    }
    run(path, &["check-ref-format", "--branch", branch])?;
    if stash {
        run(
            path,
            &[
                "stash",
                "push",
                "--include-untracked",
                "-m",
                &format!("LS Panel: before switching to {branch}"),
            ],
        )?;
    }
    let mut args = vec!["switch"];
    if create {
        args.push("-c");
    }
    if force {
        args.push("--discard-changes");
    }
    args.push(branch);
    run(path, &args)?;
    status(directory)
}

#[cfg(test)]
mod tests {
    use super::{
        browser_url, checkout, gitignore_template, parse_ahead_behind, parse_branch_name,
        RepositoryLock,
    };

    #[test]
    fn branch_name_survives_a_freshly_initialized_repository_with_no_commits() {
        // Regression test: right after "Initialize Git" on an empty project,
        // `git status --branch`'s header reads "## No commits yet on main"
        // instead of the usual "## main...", so a plain "## " prefix strip
        // took the whole sentence as the branch name.
        assert_eq!(parse_branch_name("## No commits yet on main"), "main");
        assert_eq!(parse_branch_name("## Initial commit on master"), "master");
    }

    #[test]
    fn branch_name_parses_normally_once_the_branch_has_commits() {
        assert_eq!(parse_branch_name("## main"), "main");
        assert_eq!(parse_branch_name("## main...origin/main [ahead 1]"), "main");
    }

    #[test]
    fn a_second_lock_on_the_same_repository_is_rejected_until_the_first_is_released() {
        // Regression test: the background status-check fetch and a
        // user-initiated Git action both shell out to `git` in the same
        // directory with no coordination otherwise.
        let directory =
            std::env::temp_dir().join(format!("lspanel-git-lock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.to_str().unwrap();

        let first = RepositoryLock::acquire(path).unwrap();
        assert!(RepositoryLock::acquire(path).is_err());
        drop(first);
        assert!(RepositoryLock::acquire(path).is_ok());

        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn locks_on_different_repositories_do_not_interfere() {
        let a = std::env::temp_dir().join(format!("lspanel-git-lock-a-{}", std::process::id()));
        let b = std::env::temp_dir().join(format!("lspanel-git-lock-b-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&a);
        let _ = std::fs::remove_dir_all(&b);
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();

        let _first = RepositoryLock::acquire(a.to_str().unwrap()).unwrap();
        assert!(RepositoryLock::acquire(b.to_str().unwrap()).is_ok());

        std::fs::remove_dir_all(a).unwrap();
        std::fs::remove_dir_all(b).unwrap();
    }

    #[test]
    fn templates_ignore_secrets_and_runtime_dependencies() {
        assert!(gitignore_template("react").contains("node_modules/"));
        assert!(gitignore_template("laravel").contains("/vendor/"));
        assert!(gitignore_template("wordpress").contains("wp-content/uploads/"));
        assert!(gitignore_template("php").contains(".env"));
        assert!(gitignore_template("php").contains("!.env.example"));
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

    #[test]
    fn parses_ahead_behind_counts_from_the_branch_header() {
        assert_eq!(
            parse_ahead_behind("## main...origin/main [ahead 2, behind 1]"),
            (2, 1)
        );
        assert_eq!(
            parse_ahead_behind("## main...origin/main [behind 3]"),
            (0, 3)
        );
        assert_eq!(
            parse_ahead_behind("## main...origin/main [ahead 1]"),
            (1, 0)
        );
        assert_eq!(parse_ahead_behind("## main...origin/main"), (0, 0));
        assert_eq!(parse_ahead_behind("## main"), (0, 0));
    }

    fn git_repo_fixture(name: &str) -> std::path::PathBuf {
        let directory =
            std::env::temp_dir().join(format!("lspanel-git-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn run_git(directory: &std::path::Path, args: &[&str]) {
        let output = std::process::Command::new("git")
            .args(args)
            .current_dir(directory)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn checkout_rejects_combining_stash_and_force() {
        let directory = git_repo_fixture("stash-force-conflict");
        run_git(&directory, &["init", "-q"]);

        let error = checkout(directory.to_str().unwrap(), "main", false, true, true).unwrap_err();
        assert!(error.contains("not both"));

        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn stashing_before_switch_preserves_uncommitted_changes_across_branches() {
        // Regression test: a plain `git switch` refuses to move to a branch
        // when doing so would overwrite uncommitted local changes. The
        // "stash" option should shelve those changes first so the switch
        // can proceed instead of just failing.
        let directory = git_repo_fixture("stash");
        run_git(&directory, &["init", "-q", "-b", "main"]);
        run_git(&directory, &["config", "user.email", "test@example.test"]);
        run_git(&directory, &["config", "user.name", "Test"]);
        let file = directory.join("file.txt");
        std::fs::write(&file, "main-content\n").unwrap();
        run_git(&directory, &["add", "-A"]);
        run_git(&directory, &["commit", "-q", "-m", "main commit"]);
        run_git(&directory, &["switch", "-q", "-c", "feature"]);
        std::fs::write(&file, "feature-content\n").unwrap();
        run_git(&directory, &["add", "-A"]);
        run_git(&directory, &["commit", "-q", "-m", "feature commit"]);
        run_git(&directory, &["switch", "-q", "main"]);
        std::fs::write(&file, "dirty-content\n").unwrap();

        let path = directory.to_str().unwrap();
        // Without stashing, git refuses since the dirty file would be
        // overwritten by the branch switch.
        assert!(checkout(path, "feature", false, false, false).is_err());

        let status = checkout(path, "feature", false, true, false).unwrap();
        assert_eq!(status.branch, "feature");
        assert!(!status.dirty);
        let stash_list = std::process::Command::new("git")
            .args(["stash", "list"])
            .current_dir(&directory)
            .output()
            .unwrap();
        assert!(!String::from_utf8_lossy(&stash_list.stdout)
            .trim()
            .is_empty());

        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn force_switch_discards_conflicting_uncommitted_changes() {
        let directory = git_repo_fixture("force");
        run_git(&directory, &["init", "-q", "-b", "main"]);
        run_git(&directory, &["config", "user.email", "test@example.test"]);
        run_git(&directory, &["config", "user.name", "Test"]);
        let file = directory.join("file.txt");
        std::fs::write(&file, "main-content\n").unwrap();
        run_git(&directory, &["add", "-A"]);
        run_git(&directory, &["commit", "-q", "-m", "main commit"]);
        run_git(&directory, &["switch", "-q", "-c", "feature"]);
        std::fs::write(&file, "feature-content\n").unwrap();
        run_git(&directory, &["add", "-A"]);
        run_git(&directory, &["commit", "-q", "-m", "feature commit"]);
        run_git(&directory, &["switch", "-q", "main"]);
        std::fs::write(&file, "dirty-content\n").unwrap();

        let path = directory.to_str().unwrap();
        let status = checkout(path, "feature", false, false, true).unwrap();
        assert_eq!(status.branch, "feature");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "feature-content\n");

        std::fs::remove_dir_all(directory).unwrap();
    }
}
