use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnosis {
    pub healthy: bool,
    pub summary: String,
    pub findings: Vec<Finding>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub severity: String,
    pub title: String,
    pub explanation: String,
    pub action: String,
}

pub fn environment(app: &tauri::AppHandle, id: &str) -> Result<Diagnosis, String> {
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = crate::containers::detect_runtime(preferred.as_deref());
    let mut findings = Vec::new();
    if !runtime.installed {
        findings.push(finding(
            "error",
            "Container runtime is missing",
            "Docker or Podman could not be found in PATH.",
            "Install Docker Engine or Podman, then run System Health again.",
        ));
    } else if !runtime.running {
        findings.push(finding(
            "error",
            "Container daemon is unavailable",
            "The runtime client is installed, but its daemon or socket cannot be reached.",
            "Start the Docker/Podman service and verify that your user can access its socket.",
        ));
    } else if !runtime.compose_available {
        findings.push(finding(
            "error",
            "Compose provider is unavailable",
            "The runtime works, but Compose commands cannot be executed.",
            "Install Docker Compose v2 or podman-compose.",
        ));
    }
    let inspection = crate::containers::inspect_environment(app, id)?;
    for service in &inspection.services {
        if service.health.starts_with("unhealthy")
            || service.state == "exited"
            || service.state == "dead"
        {
            findings.push(finding(
                "error",
                &format!(
                    "{} service is {}",
                    service.name,
                    if service.health.starts_with("unhealthy") {
                        "unhealthy"
                    } else {
                        &service.state
                    }
                ),
                "The container did not reach a usable running state.",
                &format!(
                    "Open {} logs, correct its configuration, and rebuild the environment.",
                    service.name
                ),
            ));
        }
    }
    let logs = inspection.logs.to_lowercase();
    let patterns=[("address already in use","Port conflict","A required host port is already occupied.","Stop the process using that port or change the configured port."),("permission denied","File permission problem","A container or LS Panel cannot access a required file or socket.","Use Repair permissions for project files and verify runtime socket access."),("no space left on device","Disk space exhausted","The runtime cannot create files, images, or database data.","Free disk space and remove unused container data after reviewing it."),("connection refused","Service connection refused","One service tried to connect before its dependency became available or used the wrong host/port.","Check dependency health and use Compose service names such as database or redis."),("access denied for user","Database authentication failed","The configured database username or password does not match the database volume.","Restore matching credentials or recreate the database volume after making a backup."),("could not translate host name","DNS resolution failed","A service hostname cannot be resolved inside the project network.","Use Compose service names such as database, redis or mailpit instead of localhost."),("name or service not known","DNS resolution failed","A service hostname cannot be resolved inside the project network.","Check the hostname and confirm that both services use the same Compose network."),("certificate verify failed","SSL certificate validation failed","The application rejected the HTTPS certificate or its trust chain.","Install the LS Panel Local CA and verify that the requested domain matches the certificate."),("unable to get local issuer certificate","SSL issuer is not trusted","The local CA is missing from the container or host trust store.","Install or re-install the LS Panel Local CA, then restart the affected client."),("module not found","Application dependency is missing","The application started without a required package or module.","Run the project install command, then rebuild or restart the service."),("vendor/autoload.php","Composer dependencies are missing","The PHP vendor directory has not been installed.","Run composer install in the project container."),("out of memory","Container ran out of memory","The process exceeded its memory allocation.","Increase the environment memory limit or reduce application memory usage.")];
    for (needle, title, explanation, action) in patterns {
        if logs.contains(needle) && !findings.iter().any(|item| item.title == title) {
            findings.push(finding("error", title, explanation, action));
        }
    }
    let healthy = findings.is_empty() && inspection.status == "running";
    let summary = if healthy {
        "No known environment problems were detected".into()
    } else if findings.is_empty() {
        "The environment is stopped; no specific log error was detected".into()
    } else {
        format!("Detected {} actionable problem(s)", findings.len())
    };
    Ok(Diagnosis {
        healthy,
        summary,
        findings,
    })
}
fn finding(severity: &str, title: &str, explanation: &str, action: &str) -> Finding {
    Finding {
        severity: severity.into(),
        title: title.into(),
        explanation: explanation.into(),
        action: action.into(),
    }
}
