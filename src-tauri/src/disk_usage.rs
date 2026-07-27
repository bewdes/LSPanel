use serde::Serialize;
use std::process::Stdio;

use crate::containers::{detect_runtime, runtime_command};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsageCategory {
    pub label: String,
    pub total: String,
    pub active: String,
    pub size: String,
    pub reclaimable: String,
}

fn executable(app: &tauri::AppHandle) -> Result<String, String> {
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let status = detect_runtime(preferred.as_deref());
    status
        .runtime
        .filter(|_| status.running)
        .ok_or(status.message)
}

fn text<const N: usize>(value: &serde_json::Value, keys: [&str; N]) -> String {
    keys.into_iter()
        .find_map(|key| value.get(key))
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| value.to_string())
        })
        .unwrap_or_default()
}

fn parse_categories(output: &str) -> Vec<DiskUsageCategory> {
    let values = serde_json::from_str::<serde_json::Value>(output)
        .ok()
        .map(|value| match value {
            serde_json::Value::Array(values) => values,
            value => vec![value],
        })
        .unwrap_or_else(|| {
            output
                .lines()
                .filter_map(|line| serde_json::from_str(line).ok())
                .collect()
        });
    values
        .into_iter()
        .filter_map(|value| {
            let label = text(&value, ["Type", "type"]);
            if label.is_empty() {
                return None;
            }
            Some(DiskUsageCategory {
                label,
                total: text(&value, ["TotalCount", "Total", "total"]),
                active: text(&value, ["Active", "active"]),
                size: text(&value, ["Size", "size"]),
                reclaimable: text(&value, ["Reclaimable", "reclaimable"]),
            })
        })
        .collect()
}

pub fn usage(app: &tauri::AppHandle) -> Result<Vec<DiskUsageCategory>, String> {
    let executable = executable(app)?;
    let output = crate::process::output(
        runtime_command(&executable)
            .args(["system", "df", "--format", "json"])
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "disk usage",
    )?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    Ok(parse_categories(&String::from_utf8_lossy(&output.stdout)))
}

fn run_prune(app: &tauri::AppHandle, args: &[&str], label: &str) -> Result<String, String> {
    let executable = executable(app)?;
    let output = crate::process::output(
        runtime_command(&executable).args(args).stdin(Stdio::null()),
        crate::process::NETWORK_TIMEOUT,
        label,
    )?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    let summary = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    Ok(if summary.is_empty() {
        "Nothing to reclaim".into()
    } else {
        summary
    })
}

/// Removes only build cache layers. Never touches images, containers, or volumes.
pub fn prune_build_cache(app: &tauri::AppHandle) -> Result<String, String> {
    run_prune(app, &["builder", "prune", "-f"], "build cache cleanup")
}

/// Deliberately omits `-a`: only removes untagged images not referenced by any
/// container (running or stopped). A tagged image a stopped environment still
/// needs is structurally excluded by Docker/Podman's own prune semantics.
pub fn prune_dangling_images(app: &tauri::AppHandle) -> Result<String, String> {
    run_prune(app, &["image", "prune", "-f"], "dangling image cleanup")
}

#[cfg(test)]
mod tests {
    use super::parse_categories;

    #[test]
    fn parses_a_docker_style_json_array() {
        let output = r#"[
            {"Type":"Images","TotalCount":"12","Active":"4","Size":"1.2GB","Reclaimable":"800MB (66%)"},
            {"Type":"Build Cache","TotalCount":"20","Active":"0","Size":"340MB","Reclaimable":"340MB"}
        ]"#;
        let categories = parse_categories(output);
        assert_eq!(categories.len(), 2);
        assert_eq!(categories[0].label, "Images");
        assert_eq!(categories[0].size, "1.2GB");
        assert_eq!(categories[1].label, "Build Cache");
        assert_eq!(categories[1].reclaimable, "340MB");
    }

    #[test]
    fn parses_podman_style_ndjson_with_lowercase_keys() {
        let output = "{\"type\":\"Images\",\"total\":\"5\",\"active\":\"2\",\"size\":\"500MB\",\"reclaimable\":\"100MB\"}\n\
                       {\"type\":\"Containers\",\"total\":\"3\",\"active\":\"1\",\"size\":\"50MB\",\"reclaimable\":\"10MB\"}";
        let categories = parse_categories(output);
        assert_eq!(categories.len(), 2);
        assert_eq!(categories[0].label, "Images");
        assert_eq!(categories[0].active, "2");
        assert_eq!(categories[1].label, "Containers");
    }

    #[test]
    fn ignores_entries_without_a_recognizable_type() {
        let output = r#"[{"Foo":"bar"}]"#;
        assert!(parse_categories(output).is_empty());
    }

    #[test]
    fn tolerates_empty_or_garbage_output() {
        assert!(parse_categories("").is_empty());
        assert!(parse_categories("not json at all").is_empty());
    }
}
