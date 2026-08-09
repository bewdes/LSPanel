use std::net::IpAddr;
use std::process::{Command, Stdio};
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// Rejects webhook URLs that point at loopback/private/link-local hosts or
/// known cloud metadata endpoints, so a webhook can't be used to redirect
/// secret-bearing notifications (see `security::configured_secrets`) to
/// infrastructure reachable only from this machine or its network.
pub(crate) fn targets_public_host(url: &str) -> bool {
    let Some(without_scheme) = url.strip_prefix("https://") else {
        return false;
    };
    let authority = without_scheme.split('/').next().unwrap_or_default();
    let host_port = authority.rsplit('@').next().unwrap_or_default();
    let host = host_port
        .split(':')
        .next()
        .unwrap_or_default()
        .trim_matches(|c| c == '[' || c == ']');
    if host.is_empty() || host.eq_ignore_ascii_case("localhost") || host == "169.254.169.254" {
        return false;
    }
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => {
            !(ip.is_loopback() || ip.is_unspecified() || ip.is_private() || ip.is_link_local())
        }
        Ok(IpAddr::V6(ip)) => !(ip.is_loopback() || ip.is_unspecified()),
        Err(_) => true,
    }
}

/// Posts `message` to the configured webhook (Slack/Discord-compatible
/// incoming webhook), if one is set up. Sends both `text` (Slack) and
/// `content` (Discord) keys in the same payload — each service simply
/// ignores the field it doesn't recognize, so one request works for both.
pub fn notify(app: &tauri::AppHandle, message: &str) {
    let Ok(Some(settings)) = crate::settings::load(app) else {
        return;
    };
    let url = settings.webhook_url.trim();
    if url.is_empty() || !targets_public_host(url) {
        return;
    }
    let payload = serde_json::json!({ "text": message, "content": message }).to_string();
    let _ = crate::process::output(
        Command::new("curl")
            .args([
                "-sS",
                "--max-time",
                "10",
                "-X",
                "POST",
                "-H",
                "Content-Type: application/json",
                "-d",
                &payload,
                url,
            ])
            .stdin(Stdio::null()),
        REQUEST_TIMEOUT,
        "Webhook delivery",
    );
}

#[cfg(test)]
mod tests {
    use super::targets_public_host;

    #[test]
    fn rejects_non_https_and_loopback_hosts() {
        assert!(!targets_public_host("http://example.test/hook"));
        assert!(!targets_public_host("https://localhost/hook"));
        assert!(!targets_public_host("https://127.0.0.1/hook"));
        assert!(!targets_public_host("https://[::1]/hook"));
        assert!(!targets_public_host(
            "https://169.254.169.254/latest/meta-data"
        ));
    }

    #[test]
    fn rejects_private_and_link_local_ranges() {
        assert!(!targets_public_host("https://10.0.0.5/hook"));
        assert!(!targets_public_host("https://192.168.1.5/hook"));
        assert!(!targets_public_host("https://172.16.0.5/hook"));
        assert!(!targets_public_host("https://169.254.1.1/hook"));
    }

    #[test]
    fn rejects_userinfo_tricks_that_disguise_a_loopback_host() {
        assert!(!targets_public_host(
            "https://hooks.slack.com:x@127.0.0.1/hook"
        ));
    }

    #[test]
    fn accepts_ordinary_public_webhook_urls() {
        assert!(targets_public_host(
            "https://hooks.slack.com/services/T00/B00/xxx"
        ));
        assert!(targets_public_host(
            "https://discord.com/api/webhooks/1/abc"
        ));
    }
}
