use std::process::{Command, Stdio};
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// Posts `message` to the configured webhook (Slack/Discord-compatible
/// incoming webhook), if one is set up. Sends both `text` (Slack) and
/// `content` (Discord) keys in the same payload — each service simply
/// ignores the field it doesn't recognize, so one request works for both.
pub fn notify(app: &tauri::AppHandle, message: &str) {
    let Ok(Some(settings)) = crate::settings::load(app) else {
        return;
    };
    let url = settings.webhook_url.trim();
    if url.is_empty() || !url.starts_with("https://") {
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
