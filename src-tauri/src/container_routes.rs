use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    time::Duration,
};

pub(crate) fn service_hostname(service: &str, environment_name: &str) -> String {
    format!(
        "{}.{}.localhost",
        service,
        environment_name.replace('_', "-").to_ascii_lowercase()
    )
}

pub(crate) fn status_is_available(status: u16) -> bool {
    (200..500).contains(&status)
}

pub(crate) fn local_http_status(host: &str) -> Result<u16, String> {
    local_http_status_on(host, 80)
}

pub(crate) fn local_http_status_on(host: &str, port: u16) -> Result<u16, String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(1))
        .map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(1)))
        .map_err(|error| error.to_string())?;
    stream
        .write_all(
            format!("GET / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n").as_bytes(),
        )
        .map_err(|error| error.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    response
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|status| status.parse().ok())
        .ok_or_else(|| "gateway returned an invalid HTTP response".into())
}

pub(crate) fn https_proxy_block(hostnames: &str, target: &str) -> String {
    format!(
        "server {{ listen 443 ssl; server_name {hostnames}; ssl_certificate /etc/nginx/tls/local.crt; ssl_certificate_key /etc/nginx/tls/local.key; ssl_protocols TLSv1.2 TLSv1.3; location / {{ resolver 127.0.0.11 valid=10s ipv6=off; set $lspanel_upstream http://{target}; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https; proxy_pass $lspanel_upstream; }} }}"
    )
}

pub(crate) fn live_link_proxy_block(
    domain: &str,
    target: &str,
    local_port: u16,
    external_port: u16,
) -> String {
    format!(
        "server {{\n  listen 80 default_server;\n  server_name _;\n  location / {{\n    proxy_pass http://{target};\n    proxy_http_version 1.1;\n    proxy_set_header Host {domain};\n    proxy_set_header X-Forwarded-Host $host;\n    proxy_set_header X-Forwarded-Proto https;\n    proxy_set_header X-Real-IP $remote_addr;\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection \"upgrade\";\n    proxy_set_header Accept-Encoding \"\";\n    proxy_redirect http://{domain}/ https://$host/;\n    proxy_redirect https://{domain}/ https://$host/;\n    proxy_cookie_domain {domain} $host;\n    sub_filter_once off;\n    sub_filter_types text/css application/javascript application/json text/javascript application/xml;\n    sub_filter 'http://{domain}' 'https://$host';\n    sub_filter 'https://{domain}' 'https://$host';\n  }}\n}}"
    )
    .replacen("listen 80 default_server", &format!("listen {local_port}"), 1)
    .replace(
        "proxy_set_header X-Forwarded-Host $host;",
        &format!(
            "proxy_set_header X-Forwarded-Host $http_host;\n    proxy_set_header X-Forwarded-Port {external_port};"
        ),
    )
    .replace("https://$host", "https://$http_host")
}

#[cfg(test)]
mod tests {
    use super::{https_proxy_block, live_link_proxy_block, service_hostname, status_is_available};

    #[test]
    fn routes_normalize_names_and_accept_application_errors() {
        assert_eq!(
            service_hostname("mailpit", "My_Project"),
            "mailpit.my-project.localhost"
        );
        assert!(status_is_available(404));
        assert!(!status_is_available(500));
    }

    #[test]
    fn https_proxy_forwards_the_original_scheme_and_host() {
        let block = https_proxy_block("demo.localhost", "demo-web:80");
        assert!(block.contains("server_name demo.localhost"));
        assert!(block.contains("proxy_set_header Host $host"));
        assert!(block.contains("proxy_set_header X-Forwarded-Proto https"));
        assert!(block.contains("proxy_pass $lspanel_upstream"));
    }

    #[test]
    fn live_link_rewrites_local_assets_redirects_and_cookies() {
        let block = live_link_proxy_block("demo.localhost", "lsp-demo:80", 18_080, 8443);
        assert!(block.contains("listen 18080"));
        assert!(block.contains("proxy_set_header Host demo.localhost"));
        assert!(block.contains("X-Forwarded-Host $http_host"));
        assert!(block.contains("X-Forwarded-Port 8443"));
        assert!(block.contains("sub_filter 'https://demo.localhost' 'https://$http_host'"));
        assert!(block.contains("proxy_redirect https://demo.localhost/ https://$http_host/"));
        assert!(block.contains("proxy_cookie_domain demo.localhost $host"));
        assert!(block.contains("proxy_set_header Upgrade $http_upgrade"));
    }
}
