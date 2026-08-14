use serde_json::Value;

const RESPONSE_MARKER: &str = "__LSP_MAILPIT_RESPONSE__";

pub fn messages(app: &tauri::AppHandle, environment_id: &str) -> Result<Value, String> {
    request(app, environment_id, "GET", "/api/v1/messages", None, true)
}

pub fn message(
    app: &tauri::AppHandle,
    environment_id: &str,
    message_id: &str,
) -> Result<Value, String> {
    validate_id(message_id)?;
    request(
        app,
        environment_id,
        "GET",
        &format!("/api/v1/message/{message_id}"),
        None,
        true,
    )
}

pub fn delete(
    app: &tauri::AppHandle,
    environment_id: &str,
    message_id: &str,
) -> Result<(), String> {
    validate_id(message_id)?;
    let body = serde_json::to_string(&serde_json::json!({ "IDs": [message_id] }))
        .map_err(|error| error.to_string())?;
    request(
        app,
        environment_id,
        "DELETE",
        "/api/v1/messages",
        Some(&body),
        false,
    )
    .map(|_| ())
}

pub fn release(
    app: &tauri::AppHandle,
    environment_id: &str,
    message_id: &str,
    recipients: Vec<String>,
) -> Result<(), String> {
    validate_id(message_id)?;
    if recipients.is_empty()
        || recipients.len() > 50
        || recipients.iter().any(|recipient| !valid_email(recipient))
    {
        return Err("Enter valid release recipients".into());
    }
    let body = serde_json::to_string(&serde_json::json!({ "To": recipients }))
        .map_err(|error| error.to_string())?;
    if body.len() > 480 {
        return Err("Release recipient list is too long".into());
    }
    request(
        app,
        environment_id,
        "POST",
        &format!("/api/v1/message/{message_id}/release"),
        Some(&body),
        false,
    )
    .map(|_| ())
}

pub fn checks(
    app: &tauri::AppHandle,
    environment_id: &str,
    message_id: &str,
) -> Result<Value, String> {
    validate_id(message_id)?;
    let html = request(
        app,
        environment_id,
        "GET",
        &format!("/api/v1/message/{message_id}/html-check"),
        None,
        true,
    );
    let spam = request(
        app,
        environment_id,
        "GET",
        &format!("/api/v1/message/{message_id}/sa-check"),
        None,
        true,
    );
    Ok(serde_json::json!({
        "html": html.as_ref().ok(),
        "htmlError": html.err(),
        "spam": spam.as_ref().ok(),
        "spamError": spam.err(),
    }))
}

fn request(
    app: &tauri::AppHandle,
    environment_id: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
    expect_json: bool,
) -> Result<Value, String> {
    let environment = crate::containers::list(app)?
        .into_iter()
        .find(|environment| environment.id == environment_id)
        .ok_or("Environment not found")?;
    if !environment
        .extra_services
        .iter()
        .any(|service| service == "mailpit")
    {
        return Err("Mailpit is not enabled for this environment".into());
    }
    let (service, command) = if environment
        .extra_services
        .iter()
        .any(|service| service == "node")
    {
        (
            "node",
            vec![
                "node".into(),
                "-e".into(),
                "let o={method:process.argv[1]},b=process.argv[3];if(b){o.body=b;o.headers={'content-type':'application/json'}}fetch('http://mailpit:8025'+process.argv[2],o).then(async r=>{let b=Buffer.from(await r.arrayBuffer());console.log('__LSP_MAILPIT_RESPONSE__'+r.status+':'+b.toString('base64'))}).catch(e=>{console.error(e.message);process.exit(1)})".into(),
                method.into(),
                path.into(),
                body.unwrap_or("").into(),
            ],
        )
    } else {
        (
            if environment.web_server == "Nginx" {
                "php"
            } else {
                "web"
            },
            vec![
                "php".into(),
                "-r".into(),
                "$o=['method'=>$argv[1],'ignore_errors'=>true,'timeout'=>5];if($argv[3]!==''){$o['header']='Content-Type: application/json';$o['content']=$argv[3];}$c=stream_context_create(['http'=>$o]);$r=@file_get_contents('http://mailpit:8025'.$argv[2],false,$c);if($r===false){fwrite(STDERR,'Mailpit API request failed');exit(1);}$s=isset($http_response_header[0])&&preg_match('/\\s(\\d{3})\\s/',$http_response_header[0],$m)?$m[1]:200;echo '__LSP_MAILPIT_RESPONSE__'.$s.':'.base64_encode($r);".into(),
                method.into(),
                path.into(),
                body.unwrap_or("").into(),
            ],
        )
    };
    let output = crate::containers::execute_service_command(app, environment_id, service, command)
        .map_err(friendly_service_error)?;
    parse_response(&output, expect_json)
}

/// `execute_service_command` surfaces the container runtime's own raw error
/// (e.g. `service "web" is not running`) when the target service isn't up —
/// clear enough for the Terminal/exec-command features where the user chose
/// to run a command against a specific service, but confusing on the Mail
/// page, which never mentions a "web" service at all.
fn friendly_service_error(error: String) -> String {
    if error.contains("is not running") {
        "Mailpit is unavailable because the environment isn't running. Start the environment to view mail.".into()
    } else {
        error
    }
}

fn parse_response(output: &str, expect_json: bool) -> Result<Value, String> {
    let response = output
        .lines()
        .rev()
        .find_map(|line| line.trim().strip_prefix(RESPONSE_MARKER))
        .ok_or_else(|| {
            let detail = output.trim();
            if detail.is_empty() || detail == "Command completed without output" {
                "Mailpit returned an empty API response".to_owned()
            } else {
                format!("Mailpit API request failed: {detail}")
            }
        })?;
    let (status, encoded) = response
        .split_once(':')
        .ok_or("Mailpit returned a malformed API response")?;
    let status = status
        .parse::<u16>()
        .map_err(|_| "Mailpit returned an invalid HTTP status")?;
    let body = decode_base64(encoded)?;
    let body = String::from_utf8(body)
        .map_err(|_| "Mailpit returned a non-text API response".to_owned())?;
    if !(200..300).contains(&status) {
        let detail = body.trim();
        return Err(if detail.is_empty() {
            format!("Mailpit API request failed with HTTP {status}")
        } else {
            format!("Mailpit API request failed with HTTP {status}: {detail}")
        });
    }
    if body.trim().is_empty() {
        return Ok(Value::Null);
    }
    if expect_json {
        serde_json::from_str(body.trim())
            .map_err(|error| format!("Mailpit returned an invalid API response: {error}"))
    } else {
        Ok(Value::String(body))
    }
}

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = Vec::with_capacity(value.len() * 3 / 4);
    let mut buffer = 0_u32;
    let mut bits = 0_u8;
    for byte in value.bytes() {
        if byte == b'=' {
            break;
        }
        let decoded = TABLE
            .iter()
            .position(|candidate| *candidate == byte)
            .ok_or("Mailpit returned invalid response encoding")? as u32;
        buffer = (buffer << 6) | decoded;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    Ok(output)
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err("Invalid Mailpit message id".into());
    }
    Ok(())
}

fn valid_email(value: &str) -> bool {
    value.len() <= 320
        && !value.chars().any(char::is_whitespace)
        && value
            .split_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'))
}

#[cfg(test)]
mod tests {
    use super::{friendly_service_error, parse_response, valid_email, validate_id};

    #[test]
    fn message_ids_cannot_escape_api_paths() {
        assert!(validate_id("01J-message_ID").is_ok());
        assert!(validate_id("../messages").is_err());
        assert!(validate_id("id?delete=all").is_err());
    }

    #[test]
    fn parses_framed_response_without_being_confused_by_runtime_warnings() {
        let value = parse_response(
            "compose warning\n__LSP_MAILPIT_RESPONSE__200:eyJtZXNzYWdlcyI6W119\n",
            true,
        )
        .unwrap();
        assert_eq!(value["messages"], serde_json::json!([]));
    }

    #[test]
    fn reports_mailpit_http_errors() {
        let error = parse_response("__LSP_MAILPIT_RESPONSE__404:bm90IGZvdW5k", false).unwrap_err();
        assert!(error.contains("HTTP 404"));
        assert!(error.contains("not found"));
    }

    #[test]
    fn a_stopped_service_reports_a_clear_reason_instead_of_a_raw_compose_error() {
        let error = friendly_service_error(r#"service "web" is not running"#.into());
        assert!(error.contains("environment isn't running"));
        let other = friendly_service_error("some other failure".into());
        assert_eq!(other, "some other failure");
    }

    #[test]
    fn release_recipients_require_safe_email_addresses() {
        assert!(valid_email("developer@example.test"));
        assert!(!valid_email("developer"));
        assert!(!valid_email("a@example.test\nBcc: victim@example.test"));
    }
}
