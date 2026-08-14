use std::{path::Path, process::Stdio, thread, time::Duration};

use crate::container_lifecycle::emit_progress;
use crate::container_runtime::command as runtime_command;
use crate::container_schema::Environment;

fn compose_exec(
    executable: &str,
    directory: &Path,
    args: &[String],
) -> Result<std::process::Output, String> {
    crate::process::output(
        runtime_command(executable)
            .args(args)
            .current_dir(directory)
            .stdin(Stdio::null()),
        crate::process::DATABASE_TIMEOUT,
        "database container command",
    )
}

fn postgres_database_exists_query(database_name: &str) -> String {
    format!("SELECT 1 FROM pg_database WHERE datname = '{database_name}';")
}

/// Validated `DB_CHARSET` environment variable (set by the project wizard's
/// "Encoding" field), or MySQL/MariaDB's sane default. Shared with
/// `backups::clear_database_sql` so charset selection is consistent between
/// initial creation and a manual "clear database".
pub(crate) fn database_charset(environment: &Environment) -> &str {
    environment
        .environment_variables
        .get("DB_CHARSET")
        .filter(|value| {
            !value.is_empty()
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '_')
        })
        .map(String::as_str)
        .unwrap_or("utf8mb4")
}

pub(crate) fn ensure_database(
    app: &tauri::AppHandle,
    id: &str,
    executable: &str,
    directory: &Path,
    environment: &Environment,
) -> Result<(), String> {
    let secrets = crate::security::environment_secrets(app, id);
    crate::operations::emit_provision_line(
        app,
        id,
        "$ Waiting for the database service to accept connections…",
        &secrets,
    );
    let mut ready = false;
    let mut last_error = String::new();
    // A fresh MySQL/MariaDB data directory can take considerably longer than
    // 30 seconds to initialise on slower disks or immediately after an image pull.
    for attempt in 0..60 {
        let args = if environment.database == "PostgreSQL" {
            vec![
                "compose".into(),
                "exec".into(),
                "-T".into(),
                "database".into(),
                "pg_isready".into(),
                "-U".into(),
                environment.database_user.clone(),
            ]
        } else {
            let admin = if environment.database == "MariaDB" {
                "mariadb-admin"
            } else {
                "mysqladmin"
            };
            vec![
                "compose".into(),
                "exec".into(),
                "-T".into(),
                "database".into(),
                admin.into(),
                "ping".into(),
                "-h".into(),
                "127.0.0.1".into(),
                "-uroot".into(),
                format!("-p{}", environment.database_root_password),
                "--silent".into(),
            ]
        };
        match compose_exec(executable, directory, &args) {
            Ok(output) if output.status.success() => {
                ready = true;
                break;
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
                last_error = if stderr.is_empty() { stdout } else { stderr };
            }
            Err(error) => last_error = error,
        }
        if attempt % 5 == 0 {
            emit_progress(
                app,
                id,
                85,
                &format!(
                    "Waiting for database initialization ({}s)",
                    (attempt + 1) * 2
                ),
            );
            crate::operations::emit_provision_line(
                app,
                id,
                &format!("… still waiting ({}s)", (attempt + 1) * 2),
                &secrets,
            );
        }
        thread::sleep(Duration::from_secs(2));
    }
    if !ready {
        let log_args = vec![
            "compose".into(),
            "logs".into(),
            "--no-color".into(),
            "--tail".into(),
            "40".into(),
            "database".into(),
        ];
        let logs = compose_exec(executable, directory, &log_args)
            .ok()
            .map(|output| {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
                if stdout.is_empty() {
                    stderr
                } else {
                    stdout
                }
            })
            .unwrap_or_default();
        let detail = if !logs.is_empty() {
            logs
        } else if !last_error.is_empty() {
            last_error
        } else {
            "No database logs were returned".into()
        };
        crate::operations::emit_provision_line(app, id, &detail, &secrets);
        return Err(format!(
            "Database service did not become ready within 120 seconds.\n{detail}"
        ));
    }
    crate::operations::emit_provision_line(app, id, "Database service is ready.", &secrets);
    // The project wizard's "Automatically create database" toggle is stored
    // as an environment variable rather than a dedicated field; honor it
    // here instead of always creating the database regardless of the user's
    // choice. The database *server* still needs to be up first (waited for
    // above) even when skipping creation, since an app installer or an
    // imported SQL dump may create its own database.
    if environment
        .environment_variables
        .get("LS_PANEL_AUTO_CREATE_DATABASE")
        .map(String::as_str)
        == Some("false")
    {
        return Ok(());
    }
    if environment.database == "PostgreSQL" {
        let query = postgres_database_exists_query(&environment.database_name);
        let query_args = vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "-e".into(),
            format!("PGPASSWORD={}", environment.database_password),
            "database".into(),
            "psql".into(),
            "-U".into(),
            environment.database_user.clone(),
            "-d".into(),
            "postgres".into(),
            "-tAc".into(),
            query,
        ];
        let query_output = compose_exec(executable, directory, &query_args)?;
        if !query_output.status.success() {
            return Err(String::from_utf8_lossy(&query_output.stderr)
                .trim()
                .to_owned());
        }
        if String::from_utf8_lossy(&query_output.stdout).trim() == "1" {
            return Ok(());
        }
        let create_args = vec![
            "compose".into(),
            "exec".into(),
            "-T".into(),
            "-e".into(),
            format!("PGPASSWORD={}", environment.database_password),
            "database".into(),
            "createdb".into(),
            "-U".into(),
            environment.database_user.clone(),
            environment.database_name.clone(),
        ];
        crate::operations::emit_provision_line(
            app,
            id,
            &format!("$ {}", create_args.join(" ")),
            &secrets,
        );
        let output = compose_exec(executable, directory, &create_args)?;
        return if output.status.success() {
            crate::operations::emit_provision_line(app, id, "Database created.", &secrets);
            Ok(())
        } else {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            crate::operations::emit_provision_line(app, id, &error, &secrets);
            Err(error)
        };
    }

    let client = if environment.database == "MariaDB" {
        "mariadb"
    } else {
        "mysql"
    };
    let charset = database_charset(environment);
    let sql = format!("CREATE DATABASE IF NOT EXISTS `{}` CHARACTER SET {charset}; CREATE USER IF NOT EXISTS '{}'@'%' IDENTIFIED BY '{}'; ALTER USER '{}'@'%' IDENTIFIED BY '{}'; GRANT ALL PRIVILEGES ON `{}`.* TO '{}'@'%'; FLUSH PRIVILEGES;", environment.database_name, environment.database_user, environment.database_password, environment.database_user, environment.database_password, environment.database_name, environment.database_user);
    let args = vec![
        "compose".into(),
        "exec".into(),
        "-T".into(),
        "database".into(),
        client.into(),
        "-uroot".into(),
        format!("-p{}", environment.database_root_password),
        "-e".into(),
        sql,
    ];
    crate::operations::emit_provision_line(app, id, &format!("$ {}", args.join(" ")), &secrets);
    let output = compose_exec(executable, directory, &args)?;
    if output.status.success() {
        crate::operations::emit_provision_line(app, id, "Database and user created.", &secrets);
        Ok(())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        crate::operations::emit_provision_line(app, id, &error, &secrets);
        Err(error)
    }
}

#[cfg(test)]
mod tests {
    use super::{database_charset, postgres_database_exists_query};
    use crate::container_schema::Environment;
    use std::collections::BTreeMap;

    fn test_environment() -> Environment {
        Environment {
            id: "demo".into(),
            name: "demo".into(),
            web_server: "Nginx".into(),
            web_version: "1.28".into(),
            php_version: "8.4".into(),
            database: "MariaDB".into(),
            database_version: "11.8".into(),
            port: "8080".into(),
            web_container_name: "custom-web".into(),
            database_container_name: "custom-db".into(),
            php_extensions: vec!["intl".into()],
            extra_services: vec!["redis".into(), "node".into()],
            node_version: "22".into(),
            redis_version: "7.4".into(),
            database_name: "website".into(),
            database_user: "website_user".into(),
            database_password: "secret".into(),
            database_root_password: "root-secret".into(),
            php_memory_limit: "256M".into(),
            php_upload_limit: "64M".into(),
            php_post_limit: "64M".into(),
            php_execution_time: 120,
            php_jit: false,
            php_jit_mode: "tracing".into(),
            php_jit_buffer_size: "64M".into(),
            php_cron: false,
            php_cron_schedule: "* * * * *".into(),
            php_cron_command: "php artisan schedule:run".into(),
            php_fpm_process_manager: "dynamic".into(),
            php_fpm_max_children: 10,
            php_fpm_start_servers: 2,
            php_fpm_min_spare_servers: 1,
            php_fpm_max_spare_servers: 3,
            php_fpm_max_requests: 500,
            php_xdebug: false,
            php_xdebug_mode: "develop,debug".into(),
            php_xdebug_port: 9003,
            php_xdebug_start: "trigger".into(),
            php_xdebug_ide_key: "LSPANEL".into(),
            environment_variables: BTreeMap::from([("APP_ENV".into(), "local".into())]),
            redis_password: "redis-secret".into(),
            redis_memory_limit: "256mb".into(),
            redis_eviction_policy: "allkeys-lru".into(),
            elasticsearch_version: "8.15.3".into(),
            elasticsearch_memory_limit: "512m".into(),
            minio_version: "RELEASE.2024-11-07T00-52-20Z".into(),
            minio_root_user: "minioadmin".into(),
            minio_root_password: "minioadmin123".into(),
            rabbitmq_version: "3.13".into(),
            rabbitmq_user: "guest".into(),
            rabbitmq_password: "guest".into(),
            node_package_manager: "pnpm".into(),
            node_auto_install: true,
            node_auto_restart: true,
            node_command: "pnpm dev".into(),
            node_run_mode: "dev".into(),
            node_dev_command: "pnpm dev".into(),
            node_build_command: "pnpm build".into(),
            node_start_command: "pnpm start".into(),
            node_inspector: false,
            node_inspector_port: 9229,
            runtime_mode: "container".into(),
            composer_version: "2".into(),
            restart_policy: "unless-stopped".into(),
            cpu_limit: "2.0".into(),
            container_memory_limit: "2g".into(),
            wordpress_site_title: String::new(),
            wordpress_admin_user: String::new(),
            wordpress_admin_password: String::new(),
            wordpress_admin_email: String::new(),
            backup_schedule_enabled: false,
            backup_schedule_interval_hours: 24,
            backup_retention_count: 7,
        }
    }

    #[test]
    fn postgres_database_check_uses_server_sql_without_psql_meta_commands() {
        let query = postgres_database_exists_query("app");
        assert_eq!(query, "SELECT 1 FROM pg_database WHERE datname = 'app';");
        assert!(!query.contains("\\gexec"));
    }

    #[test]
    fn database_charset_defaults_to_utf8mb4() {
        let mut environment = test_environment();
        environment.environment_variables.remove("DB_CHARSET");
        assert_eq!(database_charset(&environment), "utf8mb4");
    }

    #[test]
    fn database_charset_uses_a_valid_wizard_selection() {
        let mut environment = test_environment();
        environment
            .environment_variables
            .insert("DB_CHARSET".into(), "utf8".into());
        assert_eq!(database_charset(&environment), "utf8");
    }

    #[test]
    fn database_charset_rejects_values_that_are_not_a_safe_identifier() {
        // A charset name is interpolated directly into `CREATE DATABASE ...
        // CHARACTER SET {charset}` with no further escaping — reject
        // anything that isn't alphanumeric/underscore rather than trusting
        // an environment_variables entry that a user could have hand-edited.
        let mut environment = test_environment();
        environment
            .environment_variables
            .insert("DB_CHARSET".into(), "utf8mb4; DROP TABLE users;".into());
        assert_eq!(database_charset(&environment), "utf8mb4");
    }
}
