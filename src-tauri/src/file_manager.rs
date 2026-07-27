use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::Manager;

const MAX_TEXT_FILE_SIZE: u64 = 2 * 1024 * 1024;
const MAX_SEARCH_RESULTS: usize = 200;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileEntry {
    pub name: String,
    pub path: String,
    pub directory: bool,
    pub size: u64,
    pub modified_at: Option<u64>,
    pub hidden: bool,
    pub permissions: Option<String>,
    pub owner: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTextFile {
    pub path: String,
    pub text: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPathUsage {
    pub bytes: u64,
    pub files: u64,
    pub directories: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileManagerOverview {
    pub sites: ProjectPathUsage,
    pub containers: ProjectPathUsage,
    pub backups: ProjectPathUsage,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDetails {
    pub bytes: u64,
    pub files: u64,
    pub directories: u64,
    pub permissions: Option<String>,
}

pub fn list(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
) -> Result<Vec<ProjectFileEntry>, String> {
    let (root, path) = existing_path(app, site_id, relative)?;
    if !path.is_dir() {
        return Err("Selected project path is not a directory".into());
    }
    let mut entries = fs::read_dir(path)
        .map_err(|error| format!("Failed to read project directory: {error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| describe(&root, &entry.path()).ok())
        .collect::<Vec<_>>();
    entries.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

pub fn read(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
) -> Result<ProjectTextFile, String> {
    let (_, path) = existing_path(app, site_id, relative)?;
    reject_symlink(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Selected project path is not a file".into());
    }
    if metadata.len() > MAX_TEXT_FILE_SIZE {
        return Err("File is larger than the 2 MiB editor limit".into());
    }
    let bytes = fs::read(&path).map_err(|error| format!("Failed to read project file: {error}"))?;
    let text =
        String::from_utf8(bytes).map_err(|_| "Binary files cannot be opened in the editor")?;
    Ok(ProjectTextFile {
        path: normalize(relative)?,
        size: metadata.len(),
        text,
    })
}

pub fn write(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
    text: &str,
) -> Result<ProjectTextFile, String> {
    if text.len() as u64 > MAX_TEXT_FILE_SIZE {
        return Err("File is larger than the 2 MiB editor limit".into());
    }
    let (_, path) = target_path(app, site_id, relative)?;
    if path.exists() {
        reject_symlink(&path)?;
        if !path.is_file() {
            return Err("Selected project path is not a file".into());
        }
    }
    atomic_write(&path, text.as_bytes())?;
    read(app, site_id, relative)
}

pub fn create_directory(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
) -> Result<(), String> {
    let (_, path) = target_path(app, site_id, relative)?;
    fs::create_dir(&path).map_err(|error| format!("Failed to create project directory: {error}"))
}

pub fn rename(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
    new_name: &str,
) -> Result<String, String> {
    validate_name(new_name)?;
    let (root, source) = existing_path(app, site_id, relative)?;
    if source == root {
        return Err("Project root cannot be renamed here".into());
    }
    reject_symlink(&source)?;
    let destination = source
        .parent()
        .ok_or("Invalid project path")?
        .join(new_name);
    if destination.exists() {
        return Err("A file or directory with this name already exists".into());
    }
    fs::rename(&source, &destination)
        .map_err(|error| format!("Failed to rename project item: {error}"))?;
    destination
        .strip_prefix(root)
        .map(path_string)
        .map_err(|_| "Renamed path escaped the project directory".into())
}

pub fn delete(app: &tauri::AppHandle, site_id: &str, relative: &str) -> Result<(), String> {
    let (root, path) = existing_path(app, site_id, relative)?;
    if path == root {
        return Err("Project root cannot be deleted here".into());
    }
    reject_symlink(&path)?;
    if path.is_dir() {
        fs::remove_dir(&path)
            .map_err(|error| format!("Directory must be empty before deletion: {error}"))
    } else {
        fs::remove_file(&path).map_err(|error| format!("Failed to delete project file: {error}"))
    }
}

pub fn search(
    app: &tauri::AppHandle,
    site_id: &str,
    query: &str,
) -> Result<Vec<ProjectFileEntry>, String> {
    let query = query.trim().to_lowercase();
    if query.len() < 2 {
        return Ok(Vec::new());
    }
    let root = project_root(app, site_id)?;
    let mut results = Vec::new();
    search_directory(&root, &root, &query, &mut results)?;
    Ok(results)
}

pub fn absolute_path(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
) -> Result<String, String> {
    let (_, path) = existing_path(app, site_id, relative)?;
    reject_symlink(&path)?;
    Ok(path.display().to_string())
}

pub fn usage(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
) -> Result<ProjectPathUsage, String> {
    let (_, path) = existing_path(app, site_id, relative)?;
    reject_symlink(&path)?;
    measure_path(&path)
}

pub fn overview(app: &tauri::AppHandle) -> Result<FileManagerOverview, String> {
    let mut sites_usage = empty_usage();
    let mut seen = std::collections::HashSet::new();
    for site in crate::sites::list(app)? {
        let Ok(path) = fs::canonicalize(site.directory) else {
            continue;
        };
        if seen.insert(path.clone()) {
            merge_usage(&mut sites_usage, measure_path(&path)?);
        }
    }
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let containers = measure_optional_path(&data.join("stacks"))?;
    let mut backups = measure_optional_path(&data.join("backups"))?;
    merge_usage(
        &mut backups,
        measure_optional_path(&data.join("snapshots"))?,
    );
    Ok(FileManagerOverview {
        sites: sites_usage,
        containers,
        backups,
    })
}

pub fn folder_details(
    app: &tauri::AppHandle,
    scope: &str,
    resource_id: &str,
) -> Result<FolderDetails, String> {
    let path = if scope == "site" {
        project_root(app, resource_id)?
    } else {
        managed_root(app, scope, resource_id)?
    };
    if !path.exists() {
        return Ok(FolderDetails {
            bytes: 0,
            files: 0,
            directories: 0,
            permissions: None,
        });
    }
    reject_symlink(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let usage = measure_path(&path)?;
    Ok(FolderDetails {
        bytes: usage.bytes,
        files: usage.files,
        directories: usage.directories,
        permissions: unix_permissions(&metadata),
    })
}

#[cfg(unix)]
pub fn set_permissions(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
    mode: &str,
) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    if mode.len() != 3 || !mode.chars().all(|value| matches!(value, '0'..='7')) {
        return Err("Permissions must be a three-digit octal mode such as 644 or 755".into());
    }
    let mode = u32::from_str_radix(mode, 8).map_err(|error| error.to_string())?;
    let (_, path) = existing_path(app, site_id, relative)?;
    reject_symlink(&path)?;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
        .map_err(|error| format!("Failed to change project item permissions: {error}"))
}

#[cfg(not(unix))]
pub fn set_permissions(_: &tauri::AppHandle, _: &str, _: &str, _: &str) -> Result<(), String> {
    Err("Changing Unix permissions is not supported on this operating system".into())
}

pub fn list_managed(
    app: &tauri::AppHandle,
    scope: &str,
    resource_id: &str,
    relative: &str,
) -> Result<Vec<ProjectFileEntry>, String> {
    let root = managed_root(app, scope, resource_id)?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    let path = managed_existing_path(&root, relative)?;
    if !path.is_dir() {
        return Err("Selected managed path is not a directory".into());
    }
    let mut entries = fs::read_dir(path)
        .map_err(|error| format!("Failed to read managed directory: {error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| describe(&root, &entry.path()).ok())
        .collect::<Vec<_>>();
    entries.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

pub fn read_managed(
    app: &tauri::AppHandle,
    scope: &str,
    resource_id: &str,
    relative: &str,
) -> Result<ProjectTextFile, String> {
    let root = managed_root(app, scope, resource_id)?;
    let path = managed_existing_path(&root, relative)?;
    reject_symlink(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Selected managed path is not a file".into());
    }
    if metadata.len() > MAX_TEXT_FILE_SIZE {
        return Err("File is larger than the 2 MiB preview limit".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("Failed to read managed file: {error}"))?;
    let text = String::from_utf8(bytes).map_err(|_| "Binary files cannot be previewed")?;
    Ok(ProjectTextFile {
        path: normalize(relative)?,
        size: metadata.len(),
        text,
    })
}

fn search_directory(
    root: &Path,
    directory: &Path,
    query: &str,
    results: &mut Vec<ProjectFileEntry>,
) -> Result<(), String> {
    if results.len() >= MAX_SEARCH_RESULTS {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.to_lowercase().contains(query) {
            results.push(describe(root, &path)?);
            if results.len() >= MAX_SEARCH_RESULTS {
                break;
            }
        }
        if file_type.is_dir() && !matches!(name.as_str(), ".git" | "node_modules" | "vendor") {
            search_directory(root, &path, query, results)?;
        }
    }
    Ok(())
}

fn measure_path(path: &Path) -> Result<ProjectPathUsage, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Ok(ProjectPathUsage {
            bytes: 0,
            files: 0,
            directories: 0,
        });
    }
    if metadata.is_file() {
        return Ok(ProjectPathUsage {
            bytes: metadata.len(),
            files: 1,
            directories: 0,
        });
    }
    let mut usage = ProjectPathUsage {
        bytes: 0,
        files: 0,
        directories: 1,
    };
    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        let child = measure_path(&entry.map_err(|error| error.to_string())?.path())?;
        usage.bytes = usage.bytes.saturating_add(child.bytes);
        usage.files = usage.files.saturating_add(child.files);
        usage.directories = usage.directories.saturating_add(child.directories);
    }
    Ok(usage)
}

fn empty_usage() -> ProjectPathUsage {
    ProjectPathUsage {
        bytes: 0,
        files: 0,
        directories: 0,
    }
}

fn measure_optional_path(path: &Path) -> Result<ProjectPathUsage, String> {
    if path.exists() {
        measure_path(path)
    } else {
        Ok(empty_usage())
    }
}

fn merge_usage(target: &mut ProjectPathUsage, source: ProjectPathUsage) {
    target.bytes = target.bytes.saturating_add(source.bytes);
    target.files = target.files.saturating_add(source.files);
    target.directories = target.directories.saturating_add(source.directories);
}

fn project_root(app: &tauri::AppHandle, site_id: &str) -> Result<PathBuf, String> {
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let settings = crate::settings::load(app)?.ok_or("Settings not found")?;
    let sites_root = fs::canonicalize(settings.sites_directory)
        .map_err(|error| format!("Invalid sites directory: {error}"))?;
    let root = fs::canonicalize(site.directory)
        .map_err(|error| format!("Invalid project directory: {error}"))?;
    if !root.starts_with(sites_root) {
        return Err("Project directory is outside the configured sites directory".into());
    }
    Ok(root)
}

fn managed_root(app: &tauri::AppHandle, scope: &str, resource_id: &str) -> Result<PathBuf, String> {
    if resource_id.is_empty()
        || resource_id.len() > 128
        || !resource_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err("Invalid managed resource id".into());
    }
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    match scope {
        "container" => Ok(data.join("stacks").join(resource_id)),
        "database-backup" => Ok(data.join("backups").join(resource_id)),
        "snapshot" => Ok(data.join("snapshots").join(resource_id)),
        _ => Err("Unknown managed file scope".into()),
    }
}

fn managed_existing_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = normalize(relative)?;
    reject_path_symlinks(root, &relative)?;
    let root = fs::canonicalize(root)
        .map_err(|error| format!("Managed directory is unavailable: {error}"))?;
    let path = fs::canonicalize(root.join(relative))
        .map_err(|error| format!("Managed path does not exist: {error}"))?;
    if !path.starts_with(root) {
        return Err("Managed path escaped its directory".into());
    }
    Ok(path)
}

fn existing_path(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let root = project_root(app, site_id)?;
    let relative = normalize(relative)?;
    reject_path_symlinks(&root, &relative)?;
    let path = fs::canonicalize(root.join(relative))
        .map_err(|error| format!("Project path does not exist: {error}"))?;
    if !path.starts_with(&root) {
        return Err("Project path escaped the project directory".into());
    }
    Ok((root, path))
}

fn target_path(
    app: &tauri::AppHandle,
    site_id: &str,
    relative: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let root = project_root(app, site_id)?;
    let relative = normalize(relative)?;
    if relative.is_empty() {
        return Err("A file or directory name is required".into());
    }
    let parent_relative = Path::new(&relative)
        .parent()
        .map(path_string)
        .unwrap_or_default();
    reject_path_symlinks(&root, &parent_relative)?;
    let path = root.join(relative);
    let parent = fs::canonicalize(path.parent().ok_or("Invalid project path")?)
        .map_err(|error| format!("Parent directory does not exist: {error}"))?;
    if !parent.starts_with(&root) {
        return Err("Project path escaped the project directory".into());
    }
    Ok((root, path))
}

fn normalize(relative: &str) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(value) => {
                let value = value.to_str().ok_or("Project path must be valid UTF-8")?;
                validate_name(value)?;
                parts.push(value);
            }
            _ => return Err("Only relative project paths are allowed".into()),
        }
    }
    Ok(parts.join("/"))
}

fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', '\0']) {
        return Err("Invalid project file name".into());
    }
    Ok(())
}

fn reject_symlink(path: &Path) -> Result<(), String> {
    if fs::symlink_metadata(path)
        .map_err(|error| error.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Symbolic links are not editable in the project file manager".into());
    }
    Ok(())
}

fn reject_path_symlinks(root: &Path, relative: &str) -> Result<(), String> {
    let mut current = root.to_owned();
    for component in Path::new(relative).components() {
        current.push(component);
        if current.exists()
            && fs::symlink_metadata(&current)
                .map_err(|error| error.to_string())?
                .file_type()
                .is_symlink()
        {
            return Err("Symbolic links are not accessible in the project file manager".into());
        }
    }
    Ok(())
}

fn describe(root: &Path, path: &Path) -> Result<ProjectFileEntry, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Invalid project file name")?
        .to_owned();
    Ok(ProjectFileEntry {
        path: path
            .strip_prefix(root)
            .map(path_string)
            .map_err(|_| "Project item escaped its root")?,
        directory: metadata.is_dir(),
        size: metadata.len(),
        modified_at: metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_secs()),
        hidden: name.starts_with('.'),
        permissions: unix_permissions(&metadata),
        owner: unix_owner(&metadata),
        name,
    })
}

#[cfg(unix)]
fn unix_permissions(metadata: &fs::Metadata) -> Option<String> {
    use std::os::unix::fs::PermissionsExt;
    Some(format!("{:04o}", metadata.permissions().mode() & 0o7777))
}

#[cfg(not(unix))]
fn unix_permissions(_: &fs::Metadata) -> Option<String> {
    None
}

#[cfg(unix)]
fn unix_owner(metadata: &fs::Metadata) -> Option<String> {
    use std::os::unix::fs::MetadataExt;
    Some(format!("{}:{}", metadata.uid(), metadata.gid()))
}

#[cfg(not(unix))]
fn unix_owner(_: &fs::Metadata) -> Option<String> {
    None
}

fn path_string(path: &Path) -> String {
    path.components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/")
}

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Invalid project file path")?;
    let temporary = path.with_file_name(format!(".{name}.lspanel-tmp-{}", std::process::id()));
    fs::write(&temporary, data)
        .map_err(|error| format!("Failed to write temporary project file: {error}"))?;
    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Failed to replace project file: {error}")
    })
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn accepts_only_relative_project_paths() {
        assert_eq!(normalize("src/main.ts").unwrap(), "src/main.ts");
        assert_eq!(normalize("").unwrap(), "");
        assert!(normalize("../secret").is_err());
        assert!(normalize("/etc/passwd").is_err());
        assert!(normalize("src/../secret").is_err());
    }
}
