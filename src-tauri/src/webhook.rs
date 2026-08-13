use std::net::IpAddr;
use std::process::{Command, Stdio};
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// Splits a `https://` webhook URL's authority into (host, port), stripping
/// any userinfo (`user:pass@`) and unwrapping a bracketed IPv6 literal
/// (`[fd12::1]:8443`) instead of truncating it at its first internal colon.
/// Returns `None` for anything that isn't a well-formed `https://` URL.
fn extract_host_port(url: &str) -> Option<(String, u16)> {
    let without_scheme = url.strip_prefix("https://")?;
    let authority = without_scheme.split('/').next().unwrap_or_default();
    let host_port = authority.rsplit('@').next().unwrap_or_default();
    let (host, port) = match host_port.strip_prefix('[') {
        Some(bracketed) => {
            let mut parts = bracketed.splitn(2, ']');
            let host = parts.next()?;
            let port = parts
                .next()
                .and_then(|rest| rest.strip_prefix(':'))
                .and_then(|value| value.parse().ok());
            (host, port)
        }
        None => {
            let mut parts = host_port.splitn(2, ':');
            let host = parts.next()?;
            let port = parts.next().and_then(|value| value.parse().ok());
            (host, port)
        }
    };
    if host.is_empty() {
        return None;
    }
    Some((host.to_owned(), port.unwrap_or(443)))
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_public_v4(ip),
        // An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) must be checked
        // against the same IPv4 rules as its embedded address — otherwise
        // e.g. `::ffff:127.0.0.1` or `::ffff:10.0.0.5` would slip through as
        // "public" despite pointing at loopback/private hosts.
        IpAddr::V6(ip) => match ip.to_ipv4_mapped() {
            Some(mapped) => is_public_v4(mapped),
            None => {
                !(ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local())
            }
        },
    }
}

fn is_public_v4(ip: std::net::Ipv4Addr) -> bool {
    !(ip.is_loopback() || ip.is_unspecified() || ip.is_private() || ip.is_link_local())
}

/// Rejects webhook URLs that point at loopback/private/link-local hosts or
/// known cloud metadata endpoints, so a webhook can't be used to redirect
/// secret-bearing notifications (see `security::configured_secrets`) to
/// infrastructure reachable only from this machine or its network. This is
/// a synchronous, offline pre-check — it only catches literal IPs and known-
/// bad hostnames; an ordinary hostname is accepted here and resolved for
/// real (and pinned against DNS-rebinding) by `resolve_pinned_ip` at actual
/// send time in `notify()`, since resolving DNS isn't something this
/// function can safely or deterministically do as a pure, unit-testable
/// check.
pub(crate) fn targets_public_host(url: &str) -> bool {
    let Some((host, _port)) = extract_host_port(url) else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") || host == "169.254.169.254" {
        return false;
    }
    match host.parse::<IpAddr>() {
        Ok(ip) => is_public_ip(ip),
        Err(_) => true,
    }
}

/// Resolves `host`'s DNS right before the request is sent and requires every
/// answer to be a public address, returning one to pin the request against.
/// `targets_public_host` alone can't catch a hostname whose DNS answer (at
/// request time — possibly a short-TTL "DNS rebinding" record, or simply a
/// webhook host the user configured that happens to resolve privately)
/// points at loopback/private/link-local — it never resolves DNS at all.
/// Pinning the specific address here also stops curl from re-resolving DNS
/// itself and potentially getting a different, unvalidated answer than the
/// one just checked.
fn resolve_pinned_ip(host: &str, port: u16) -> Option<IpAddr> {
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_public_ip(ip).then_some(ip);
    }
    use std::net::ToSocketAddrs;
    let mut pinned = None;
    for address in (host, port).to_socket_addrs().ok()? {
        let ip = address.ip();
        if !is_public_ip(ip) {
            return None;
        }
        pinned.get_or_insert(ip);
    }
    pinned
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
    let Some((host, port)) = extract_host_port(url) else {
        return;
    };
    let Some(pinned_ip) = resolve_pinned_ip(&host, port) else {
        return;
    };
    let resolve_argument = format!("{host}:{port}:{pinned_ip}");
    let payload = serde_json::json!({ "text": message, "content": message }).to_string();
    let _ = crate::process::output(
        Command::new("curl")
            .args([
                "-sS",
                "--max-time",
                "10",
                "--resolve",
                &resolve_argument,
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
    use super::{extract_host_port, resolve_pinned_ip, targets_public_host};

    #[test]
    fn extracts_host_and_port_defaulting_to_443() {
        assert_eq!(
            extract_host_port("https://hooks.slack.com/services/x"),
            Some(("hooks.slack.com".to_owned(), 443))
        );
        assert_eq!(
            extract_host_port("https://example.test:8443/hook"),
            Some(("example.test".to_owned(), 8443))
        );
        assert_eq!(
            extract_host_port("https://[2001:db8::1]:8443/hook"),
            Some(("2001:db8::1".to_owned(), 8443))
        );
        assert_eq!(
            extract_host_port("https://[2001:db8::1]/hook"),
            Some(("2001:db8::1".to_owned(), 443))
        );
    }

    #[test]
    fn resolve_pinned_ip_accepts_a_public_literal_and_rejects_a_private_one() {
        assert!(resolve_pinned_ip("203.0.113.5", 443).is_some());
        assert!(resolve_pinned_ip("10.0.0.5", 443).is_none());
        assert!(resolve_pinned_ip("127.0.0.1", 443).is_none());
    }

    #[test]
    fn resolve_pinned_ip_rejects_a_hostname_that_resolves_to_loopback() {
        // Regression test: targets_public_host() alone never resolves DNS,
        // so a hostname whose *actual* answer at send time is loopback
        // (deliberately, or via a short-TTL DNS-rebinding record) would
        // otherwise reach curl unpinned and unvalidated. "localhost" is used
        // here specifically because it resolves via the stub resolver
        // without needing real network access, unlike an arbitrary public
        // hostname.
        assert!(resolve_pinned_ip("localhost", 443).is_none());
    }

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
