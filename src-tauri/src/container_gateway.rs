use std::{fs, process::Stdio, thread, time::Duration};

use tauri::Manager;

use crate::container_compose::site_hostnames;
use crate::container_routes::{
    https_proxy_block, live_link_proxy_block, local_http_status, service_hostname,
    status_is_available as route_status_is_available, stopped_site_block,
};
use crate::container_runtime::command as runtime_command;
use crate::container_runtime::detect as detect_runtime;

pub(crate) fn ensure_network(executable: &str) -> Result<(), String> {
    let inspected = runtime_command(executable)
        .args(["network", "inspect", "lspanel"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if inspected.is_ok_and(|status| status.success()) {
        return Ok(());
    }
    let output = runtime_command(executable)
        .args(["network", "create", "lspanel"])
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    // Two environments can start at nearly the same time and both see the
    // network missing from `network inspect` before either finishes
    // `network create`; the loser's create fails with an "already exists"
    // style error even though the network is now present and usable either
    // way, so that specific failure isn't a real problem.
    if is_network_already_exists_error(&error) {
        Ok(())
    } else {
        Err(error)
    }
}

/// Builds the gateway's fallback ("no project matched this host") server
/// blocks for plain HTTP and HTTPS. Every `https_proxy_block()` listens on
/// 443 without a `default_server` marker, so without an explicit one here,
/// nginx would fall back to whichever real site's block happens to be first
/// in the generated file for any request whose Host/SNI doesn't match a
/// known project - silently proxying it there instead of returning a clean
/// 404 (and making the "Local HTTPS" health check, which probes with an
/// unrecognized hostname, look unhealthy even though the gateway is fine).
fn gateway_not_found_blocks(not_found_body: &str) -> (String, String) {
    (
        format!(
            "server {{ listen 80 default_server; server_name _; default_type text/html; return 404 '{not_found_body}'; }}"
        ),
        format!(
            "server {{ listen 443 ssl default_server; server_name _; ssl_certificate /etc/nginx/tls/local.crt; ssl_certificate_key /etc/nginx/tls/local.key; ssl_protocols TLSv1.2 TLSv1.3; default_type text/html; return 404 '{not_found_body}'; }}"
        ),
    )
}

pub(crate) fn ensure_gateway(app: &tauri::AppHandle, executable: &str) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("gateway");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let sites = crate::sites::list(app)?;
    let environments = crate::containers::list(app)?;
    // Every site's hostnames are included here, not just enabled ones, so the
    // local CA certificate covers a stopped project's domain too - it still
    // needs a valid HTTPS response (the "project stopped" block below),
    // rather than a cert error, when visited while its environment is off.
    let mut hostnames = sites
        .iter()
        .flat_map(|site| std::iter::once(site.domain.clone()).chain(site.aliases.clone()))
        .collect::<Vec<_>>();
    let mut blocks = sites
        .iter()
        .filter(|site| site.enabled)
        .filter_map(|site| {
            environments
                .iter()
                .find(|environment| environment.id == site.environment_id)
                .map(|environment| {
                    let target = if crate::project_templates::is_node_project(&site.project_type) {
                        format!("lsp-{}-node:3000", environment.id)
                    } else {
                        format!("lsp-{}:80", environment.id)
                    };
                    https_proxy_block(&site_hostnames(site), &target)
                })
        })
        .collect::<Vec<_>>();
    blocks.extend(
        sites
            .iter()
            .filter(|site| !site.enabled)
            .map(|site| stopped_site_block(&site_hostnames(site), &site.name)),
    );
    for environment in &environments {
        for (service, port) in [
            ("mailpit", 8025),
            ("adminer", 80),
            ("phpmyadmin", 80),
            ("elasticsearch", 9200),
            ("minio", 9001),
            ("rabbitmq", 15672),
        ] {
            if environment
                .extra_services
                .iter()
                .any(|item| item == service)
            {
                let hostname = service_hostname(service, &environment.name);
                hostnames.push(hostname.clone());
                blocks.push(https_proxy_block(
                    &hostname,
                    &format!("lsp-{}-{}:{}", environment.id, service, port),
                ));
            }
        }
    }
    hostnames.sort();
    hostnames.dedup();
    if hostnames.is_empty() {
        hostnames.push("lspanel.localhost".into());
    }
    let gateway_aliases = hostnames
        .iter()
        .map(|hostname| serde_json::to_string(hostname).unwrap())
        .collect::<Vec<_>>()
        .join(", ");
    let certificates = crate::tls::ensure(app, hostnames.clone())?;
    fs::copy(certificates.certificate, directory.join("local.crt"))
        .map_err(|error| error.to_string())?;
    fs::copy(certificates.key, directory.join("local.key")).map_err(|error| error.to_string())?;
    let live_links = crate::livelink::active_links(app);
    let live_blocks = live_links
        .iter()
        .filter_map(|link| {
            let site = sites.iter().find(|site| site.id == link.site_id)?;
            if !site.enabled {
                return None;
            }
            let environment = environments
                .iter()
                .find(|environment| environment.id == site.environment_id)?;
            let target = if crate::project_templates::is_node_project(&site.project_type) {
                format!("lsp-{}-node:3000", environment.id)
            } else {
                format!("lsp-{}:80", environment.id)
            };
            Some(live_link_proxy_block(
                &site.domain,
                &target,
                link.local_port,
                link.port,
            ))
        })
        .collect::<Vec<_>>();
    let (http_not_found, https_fallback) = gateway_not_found_blocks(
        "<!doctype html><title>LS Panel</title><style>body{font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0}main{text-align:center}p{color:#999}</style><main><h1>Local site not found</h1><p>Check the domain and start its environment in LS Panel.</p></main>",
    );
    let fallback = if live_blocks.is_empty() {
        http_not_found
    } else {
        live_blocks.join("\n")
    };
    let redirect = format!(
        "server {{ listen 80; server_name {}; return 301 https://$host$request_uri; }}",
        hostnames.join(" ")
    );
    let gzip = "gzip on;\ngzip_vary on;\ngzip_comp_level 5;\ngzip_min_length 256;\ngzip_proxied any;\ngzip_types text/plain text/css text/javascript application/javascript application/json application/xml application/xml+rss image/svg+xml font/woff2 font/woff;\nclient_max_body_size 1024m;\n";
    let blocks = format!(
        "{}{}\n{}\n{}\n{}",
        gzip,
        fallback,
        https_fallback,
        redirect,
        blocks.join("\n")
    );
    fs::write(directory.join("default.conf"), blocks).map_err(|error| error.to_string())?;
    let mut published_ports = vec![
        "\"127.0.0.1:80:80\"".to_owned(),
        "\"127.0.0.1:443:443\"".to_owned(),
    ];
    published_ports.extend(
        live_links
            .iter()
            .map(|link| format!("\"127.0.0.1:{0}:{0}\"", link.local_port)),
    );
    fs::write(directory.join("compose.yaml"), format!("name: lspanel-gateway\nservices:\n  gateway:\n    image: docker.io/library/nginx:1.28-alpine\n    ports: [{}]\n    volumes: [\"./default.conf:/etc/nginx/conf.d/default.conf:ro\", \"./local.crt:/etc/nginx/tls/local.crt:ro\", \"./local.key:/etc/nginx/tls/local.key:ro\"]\n    networks:\n      lspanel:\n        aliases: [{}]\n    restart: unless-stopped\nnetworks:\n  lspanel:\n    external: true\n", published_ports.join(", "), gateway_aliases)).map_err(|error| error.to_string())?;
    // Rootless Docker/Podman providers can try to create the replacement
    // container before rootlessport has released 80/443 from the old gateway.
    // Recreate our generated Compose project from a clean state; unrelated
    // host web servers, application stacks and the external network are never
    // touched.
    let _ = crate::process::output(
        runtime_command(executable)
            .args(["compose", "down", "--remove-orphans", "--timeout", "5"])
            .current_dir(&directory)
            .stdin(Stdio::null()),
        crate::process::SHORT_TIMEOUT,
        "existing gateway shutdown",
    );
    let mut output = runtime_command(executable)
        .args(["compose", "up", "-d", "--force-recreate"])
        .current_dir(&directory)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    let first_error = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() && is_transient_recreate_error(&first_error) {
        drop(first_error);
        thread::sleep(Duration::from_millis(500));
        output = runtime_command(executable)
            .args(["compose", "up", "-d", "--force-recreate"])
            .current_dir(&directory)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| error.to_string())?;
    }
    if output.status.success() {
        Ok(())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        Err(
            if error.contains("address already in use")
                || error.contains("port is already allocated")
            {
                "Port 80 or 443 is already in use. Stop the service using the local HTTP(S) ports, then try again."
                    .into()
            } else {
                error
            },
        )
    }
}

/// Both of these are the same underlying race: `compose down` returns before
/// the daemon has fully released the old gateway container's port binding
/// and/or its name from the container name registry, so the immediately
/// following `compose up` can fail as if the old container were still there.
/// One short retry clears it without surfacing a spurious error to the user.
fn is_transient_recreate_error(stderr: &str) -> bool {
    stderr.contains("address already in use")
        || stderr.contains("port is already allocated")
        || stderr.contains("is already in use by container")
}

/// Matches Docker's and Podman's differently-worded "a network with this
/// name already exists" errors from `network create`.
fn is_network_already_exists_error(stderr: &str) -> bool {
    stderr.contains("already exists") || stderr.contains("already used")
}

pub(crate) fn refresh_gateway(app: &tauri::AppHandle) -> Result<(), String> {
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    let executable = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
        .ok_or_else(|| format!("Cannot refresh the local gateway: {}", runtime.message))?;
    ensure_network(&executable)?;
    ensure_gateway(app, &executable)
}

pub(crate) fn remove_gateway(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("gateway");
    if !directory.exists() {
        return Ok(());
    }
    let preferred = crate::settings::load(app)?.map(|settings| settings.runtime);
    let runtime = detect_runtime(preferred.as_deref());
    if let Some(executable) = runtime
        .runtime
        .filter(|_| runtime.running && runtime.compose_available)
    {
        let output = runtime_command(&executable)
            .args(["compose", "down", "--remove-orphans"])
            .current_dir(&directory)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| format!("Failed to stop local HTTPS gateway: {error}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }
    }
    fs::remove_dir_all(&directory)
        .map_err(|error| format!("Failed to remove generated HTTPS gateway: {error}"))
}

pub(crate) fn verify_environment_sites(
    app: &tauri::AppHandle,
    environment_id: &str,
) -> Result<(), String> {
    for site in crate::sites::list(app)?
        .into_iter()
        .filter(|site| site.environment_id == environment_id && site.enabled)
    {
        let mut last = "gateway did not respond".to_owned();
        let mut ready = false;
        for _ in 0..30 {
            match local_http_status(&site.domain) {
                Ok(status) if route_status_is_available(status) => {
                    ready = true;
                    break;
                }
                Ok(status) => last = format!("HTTP {status}"),
                Err(error) => last = error,
            }
            thread::sleep(Duration::from_millis(500));
        }
        if !ready {
            return Err(format!("Local route http://{} is unavailable after 15 seconds ({last}). Check the web service logs and gateway configuration.", site.domain));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        gateway_not_found_blocks, is_network_already_exists_error, is_transient_recreate_error,
    };

    #[test]
    fn transient_recreate_errors_are_recognized() {
        // Regression test: the gateway's recreate-on-restart retry originally
        // only covered the port-binding race ("port is already allocated"),
        // not the equally-common "container name already in use" race that
        // happens when `compose down` returns before the daemon has fully
        // released the old container's name.
        assert!(is_transient_recreate_error(
            "Bind for 0.0.0.0:443 failed: port is already allocated"
        ));
        assert!(is_transient_recreate_error(
            "Error response from daemon: Conflict. The container name \"/lspanel-gateway-gateway-1\" is already in use by container \"abc123\""
        ));
        assert!(is_transient_recreate_error("address already in use"));
        assert!(!is_transient_recreate_error("no such file or directory"));
    }

    #[test]
    fn both_gateway_fallback_blocks_declare_default_server() {
        // Regression test: the HTTPS fallback lacked a `default_server`
        // marker, so nginx silently proxied any unrecognized Host/SNI to
        // whichever real site's block happened to be listed first instead
        // of returning the intended 404, which also made the "Local HTTPS"
        // health check (which probes with an unrecognized hostname) report
        // unhealthy even when the gateway was working correctly.
        let (http, https) = gateway_not_found_blocks("body");
        assert!(http.contains("listen 80 default_server"));
        assert!(https.contains("listen 443 ssl default_server"));
        assert!(https.contains("ssl_certificate /etc/nginx/tls/local.crt"));
        assert!(https.contains("ssl_certificate_key /etc/nginx/tls/local.key"));
        assert!(http.contains("return 404 'body'"));
        assert!(https.contains("return 404 'body'"));
    }

    #[test]
    fn network_already_exists_errors_are_recognized() {
        // Regression test: two environments starting at nearly the same
        // time can both see `network inspect lspanel` fail before either
        // finishes `network create lspanel`; the loser must not surface
        // this as a real error since the network exists and works either
        // way.
        assert!(is_network_already_exists_error(
            "Error response from daemon: network with name lspanel already exists"
        ));
        assert!(is_network_already_exists_error(
            "network name lspanel already used"
        ));
        assert!(!is_network_already_exists_error(
            "no such file or directory"
        ));
    }
}
