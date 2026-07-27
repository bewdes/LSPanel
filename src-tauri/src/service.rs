use serde::{Deserialize, Serialize};
use std::process::Command;
use thiserror::Error;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceAction { Start, Stop, Restart }

impl ServiceAction {
    fn as_str(&self) -> &'static str {
        match self { Self::Start => "start", Self::Stop => "stop", Self::Restart => "restart" }
    }
}

#[derive(Debug, Serialize)]
pub struct ServiceState { service: String, active: bool, status: String }

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("не удалось запустить systemctl: {0}")]
    Io(#[from] std::io::Error),
    #[error("systemctl завершился с ошибкой: {0}")]
    Command(String),
}

pub fn status(service: &str) -> Result<ServiceState, ServiceError> {
    let output = Command::new("systemctl").args(["is-active", service]).output()?;
    let text = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    Ok(ServiceState { service: service.to_owned(), active: output.status.success(), status: text })
}

pub fn control(service: &str, action: ServiceAction) -> Result<ServiceState, ServiceError> {
    let output = Command::new("systemctl").args([action.as_str(), service]).output()?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(ServiceError::Command(message));
    }
    status(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn action_is_allowlisted() { assert_eq!(ServiceAction::Restart.as_str(), "restart"); }
}
