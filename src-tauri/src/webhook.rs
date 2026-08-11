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
    // A bracketed IPv6 literal (`[fd12:3456:789a::1]:8443`) contains colons
    // of its own, so a plain `.split(':').next()` truncates it at the first
    // one instead of the closing bracket — silently turning most IPv6
    // literals into a short, non-IP-parseable prefix (e.g. "fd12") that
    // then falls through the `Err(_) => true` arm below as if it were an
    // ordinary public hostname, bypassing every loopback/private check.
    let host = match host_port.strip_prefix('[') {
        Some(bracketed) => bracketed.split(']').next().unwrap_or_default(),
        None => host_port.split(':').next().unwrap_or_default(),
    };
    if host.is_empty() || host.eq_ignore_ascii_case("localhost") || host == "169.254.169.254" {
        return false;
    }
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => is_public_v4(ip),
        // An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) must be checked
        // against the same IPv4 rules as its embedded address — otherwise
        // e.g. `::ffff:127.0.0.1` or `::ffff:10.0.0.5` would slip through as
        // "public" despite pointing at loopback/private hosts.
        Ok(IpAddr::V6(ip)) => match ip.to_ipv4_mapped() {
            Some(mapped) => is_public_v4(mapped),
            None => {
                !(ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local())
            }
        },
        Err(_) => true,
    }
}

fn is_public_v4(ip: std::net::Ipv4Addr) -> bool {
    !(ip.is_loopback() || ip.is_unspecified() || ip.is_private() || ip.is_link_local())
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
    fn rejects_ipv6_private_and_link_local_ranges() {
        // Regression test: the IPv6 branch previously only checked
        // is_loopback/is_unspecified, missing unique-local (fd00::/8) and
        // link-local (fe80::/10) ranges entirely.
        assert!(!targets_public_host("https://[fd12:3456:789a::1]/hook"));
        assert!(!targets_public_host("https://[fe80::1]/hook"));
    }

    #[test]
    fn extracts_the_full_bracketed_ipv6_host_instead_of_truncating_at_the_first_colon() {
        // Regression test: naively splitting the authority on ':' cuts a
        // bracketed IPv6 literal off at its first internal colon (e.g.
        // "[fd12:3456:789a::1]" -> "fd12"), which then fails IP parsing and
        // falls through as if it were an ordinary public hostname. A real
        // public IPv6 address (with and without an explicit port) must
        // still parse as an IP and be accepted; a private one with a port
        // must still be correctly rejected.
        assert!(targets_public_host("https://[2001:db8::1]/hook"));
        assert!(targets_public_host("https://[2001:db8::1]:8443/hook"));
        assert!(!targets_public_host(
            "https://[fd12:3456:789a::1]:8443/hook"
        ));
    }

    #[test]
    fn rejects_ipv4_mapped_ipv6_loopback_and_private_addresses() {
        // Regression test: `::ffff:a.b.c.d` (IPv4-mapped IPv6) previously
        // bypassed every IPv4 loopback/private/link-local check entirely,
        // since it's parsed as `IpAddr::V6` and none of those applied.
        assert!(!targets_public_host("https://[::ffff:127.0.0.1]/hook"));
        assert!(!targets_public_host("https://[::ffff:10.0.0.5]/hook"));
        assert!(!targets_public_host(
            "https://[::ffff:169.254.169.254]/hook"
        ));
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
