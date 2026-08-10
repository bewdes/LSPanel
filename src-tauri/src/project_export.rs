use crate::{containers::Environment, sites::Site};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// A portable, on-disk bundle of a project: its code (`app/`), an optional
/// database dump and `.env`, and a manifest describing the site/environment
/// configuration to recreate. Unlike a snapshot (same-site restore point,
/// `snapshots.rs`), importing a bundle always creates a brand-new site — the
/// bundle is meant to move a project to another machine or LS Panel install.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    site: Site,
    environment: Environment,
    exported_at: i64,
    has_database: bool,
    has_env: bool,
}

fn safe_filename(value: &str) -> String {
    let value = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let value = value.trim_matches('-');
    if value.is_empty() {
        "project".into()
    } else {
        value.chars().take(64).collect()
    }
}

fn has_server_database(database: &str) -> bool {
    !matches!(
        database.to_ascii_lowercase().as_str(),
        "" | "none" | "sqlite"
    )
}

/// Infrastructure secrets LS Panel itself generates and manages — never
/// written to a bundle that's meant to leave the machine. `wordpress_admin_password`
/// is deliberately left untouched: it's a real credential the user needs to
/// keep logging into `/wp-admin` with after moving the site.
fn strip_infrastructure_secrets(environment: &mut Environment) {
    environment.database_password = String::new();
    environment.database_root_password = String::new();
    environment.redis_password = String::new();
    environment.minio_root_password = String::new();
    environment.rabbitmq_password = String::new();
    environment
        .environment_variables
        .retain(|key, _| !crate::environment_files::secret_key(key));
}

pub fn export(
    app: &tauri::AppHandle,
    site_id: &str,
    destination: &Path,
) -> Result<PathBuf, String> {
    if !destination.is_dir() {
        return Err("Select an existing export directory".into());
    }
    let site = crate::sites::list(app)?
        .into_iter()
        .find(|site| site.id == site_id)
        .ok_or("Site not found")?;
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == site.environment_id)
        .ok_or("Environment not found")?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let bundle = destination.join(format!(
        "{}-{timestamp}.lspanel-project",
        safe_filename(&site.name)
    ));
    if bundle.exists() {
        return Err("A project export with this name already exists".into());
    }
    fs::create_dir(&bundle).map_err(|error| format!("Failed to create export bundle: {error}"))?;
    let result = (|| {
        crate::operations::progress_for_environment(
            app,
            &environment.id,
            10,
            "Copying project files",
        )?;
        crate::project_templates::copy_project(
            &Path::new(&site.directory).join("app"),
            &bundle.join("app"),
        )?;
        let has_database = has_server_database(&environment.database);
        if has_database {
            crate::operations::progress_for_environment(
                app,
                &environment.id,
                60,
                "Dumping database",
            )?;
            let backup = crate::backups::create(app, &environment.id)?;
            let copied = fs::copy(&backup.path, bundle.join("database.sql"))
                .map_err(|error| error.to_string());
            let _ = crate::backups::delete(app, &environment.id, &backup.id);
            copied?;
        }
        let env = crate::environment_files::read(app, site_id)?;
        if env.exists {
            fs::write(bundle.join("project.env"), env.text).map_err(|error| error.to_string())?;
        }
        crate::operations::progress_for_environment(app, &environment.id, 90, "Writing manifest")?;
        let mut manifest_environment = environment.clone();
        strip_infrastructure_secrets(&mut manifest_environment);
        let manifest = Manifest {
            site: site.clone(),
            environment: manifest_environment,
            exported_at: timestamp as i64,
            has_database,
            has_env: env.exists,
        };
        fs::write(
            bundle.join("manifest.json"),
            serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&bundle);
        return Err(error);
    }
    Ok(bundle)
}

pub fn import(
    app: &tauri::AppHandle,
    source: &Path,
    name: &str,
    domain: &str,
    environment_id: &str,
) -> Result<Vec<Site>, String> {
    if !source.join("app").is_dir() {
        return Err("Select an exported .lspanel-project bundle".into());
    }
    let manifest_bytes =
        fs::read(source.join("manifest.json")).map_err(|error| error.to_string())?;
    let manifest: Manifest =
        serde_json::from_slice(&manifest_bytes).map_err(|error| error.to_string())?;
    if manifest.has_database && !source.join("database.sql").is_file() {
        return Err("Bundle database dump is missing".into());
    }

    let name = name.trim().to_owned();
    crate::sites::validate_project_name(&name)?;
    let domain = domain
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_end_matches('/')
        .to_owned();
    crate::sites::validate_local_domain(&domain)?;
    let existing_sites = crate::sites::list(app)?;
    if existing_sites.iter().any(|site| {
        site.name == name || site.domain == domain || site.aliases.iter().any(|a| a == &domain)
    }) {
        return Err("A project with this name, domain or alias already exists".into());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let settings = crate::settings::load(app)?.ok_or("Complete initial setup first")?;
    let project_directory = PathBuf::from(settings.sites_directory).join(&name);
    let baseline = crate::project_templates::DirectoryBaseline::capture(&project_directory)?;

    let mut environment = manifest.environment;
    environment.id = environment_id.to_owned();
    environment.name = format!("{name}-env");
    environment.web_container_name.clear();
    environment.database_container_name.clear();
    environment.database_password = crate::environment_files::generate_secret(32)?;
    environment.database_root_password = crate::environment_files::generate_secret(32)?;
    if environment
        .extra_services
        .iter()
        .any(|item| item == "redis")
    {
        environment.redis_password = crate::environment_files::generate_secret(32)?;
    }

    let mut site = manifest.site;
    let site_id = format!("site-{timestamp}");
    site.id = site_id.clone();
    site.name = name;
    site.domain = domain;
    site.environment_id = environment_id.to_owned();
    site.directory = String::new();
    site.pinned = false;
    site.archived = false;

    let mut environment_saved = false;
    let attempt: Result<Vec<Site>, String> = (|| {
        crate::operations::progress_for_environment(
            app,
            environment_id,
            10,
            "Copying project files",
        )?;
        crate::project_templates::copy_project(
            &source.join("app"),
            &project_directory.join("app"),
        )?;
        crate::operations::progress_for_environment(
            app,
            environment_id,
            30,
            "Saving container environment",
        )?;
        crate::containers::save(app, environment.clone())?;
        environment_saved = true;
        let created = crate::sites::create(app, site)?;
        crate::operations::progress_for_environment(
            app,
            environment_id,
            50,
            "Starting container environment",
        )?;
        crate::containers::operate(app, environment_id, "rebuild")?;
        if manifest.has_env {
            let text = fs::read_to_string(source.join("project.env"))
                .map_err(|error| error.to_string())?;
            crate::environment_files::write(app, &site_id, &text)?;
        }
        if manifest.has_database {
            crate::operations::progress_for_environment(
                app,
                environment_id,
                80,
                "Restoring database",
            )?;
            crate::backups::restore_file(app, environment_id, &source.join("database.sql"))
                .map_err(|error| format!("Database restore failed: {error}"))?;
        }
        let imported_site = created
            .iter()
            .find(|item| item.id == site_id)
            .cloned()
            .ok_or("Imported project was not found")?;
        crate::project_templates::configure_duplicate(&imported_site, &environment)?;
        Ok(created)
    })();

    if let Err(error) = &attempt {
        let error = crate::security::environment_error(app, environment_id, error);
        if environment_saved {
            let _ = crate::containers::operate(app, environment_id, "destroy");
            // `false`: baseline.rollback() right below handles the project
            // directory already, same reasoning as the `sites::delete(..., false)`
            // call above.
            let _ = crate::containers::delete(app, environment_id, false);
        }
        let _ = crate::sites::delete(app, &site_id, false);
        let _ = baseline.rollback();
        return Err(error);
    }
    attempt
}

#[cfg(test)]
mod tests {
    use super::{has_server_database, safe_filename};

    #[test]
    fn detects_server_backed_databases() {
        assert!(has_server_database("MySQL"));
        assert!(has_server_database("PostgreSQL"));
        assert!(!has_server_database("SQLite"));
        assert!(!has_server_database("None"));
        assert!(!has_server_database(""));
    }

    #[test]
    fn filenames_are_safe_and_never_empty() {
        assert_eq!(safe_filename("my-project_1"), "my-project_1");
        assert_eq!(safe_filename("../../etc/passwd"), "etc-passwd");
        assert_eq!(safe_filename(""), "project");
        assert_eq!(safe_filename("***"), "project");
    }
}
