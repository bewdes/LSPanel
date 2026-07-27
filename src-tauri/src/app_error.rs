use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    pub recoverable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
}

impl AppError {
    pub fn with_operation(error: String, operation_id: String) -> Self {
        let mut value = Self::from(error);
        value.operation_id = Some(operation_id);
        value
    }

    pub fn operation_result<T>(result: Result<T, String>, operation_id: String) -> Result<T, Self> {
        result.map_err(|error| Self::with_operation(error, operation_id))
    }

    fn classify(message: &str) -> (&'static str, bool) {
        let message = message.to_ascii_lowercase();
        if message.contains("not found") || message.contains("was not found") {
            ("not_found", false)
        } else if message.contains("permission") || message.contains("denied") {
            ("permission_denied", false)
        } else if message.contains("timeout") || message.contains("timed out") {
            ("timeout", true)
        } else if message.contains("unavailable")
            || message.contains("cannot connect")
            || message.contains("failed to connect")
        {
            ("runtime_unavailable", true)
        } else if message.contains("invalid")
            || message.contains("must ")
            || message.contains("only ")
        {
            ("invalid_input", false)
        } else {
            ("operation_failed", true)
        }
    }
}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        let (code, recoverable) = Self::classify(&message);
        Self {
            code,
            message,
            recoverable,
            operation_id: None,
        }
    }
}

impl From<&str> for AppError {
    fn from(message: &str) -> Self {
        Self::from(message.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn classifies_common_errors_for_the_frontend() {
        let timeout = AppError::from("Runtime timed out".to_owned());
        assert_eq!(timeout.code, "timeout");
        assert!(timeout.recoverable);

        let validation = AppError::from("Domain must use localhost".to_owned());
        assert_eq!(validation.code, "invalid_input");
        assert!(!validation.recoverable);
    }

    #[test]
    fn carries_the_operation_id_for_support_and_retry_flows() {
        let error =
            AppError::with_operation("Container failed".to_owned(), "operation-42".to_owned());
        assert_eq!(error.operation_id.as_deref(), Some("operation-42"));
    }
}
