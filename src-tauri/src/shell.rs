/// Wraps `value` in single quotes for safe interpolation into a POSIX shell
/// command string, escaping any embedded single quote by closing the quoted
/// string, appending an escaped quote, and reopening it.
pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::shell_quote;

    #[test]
    fn wraps_plain_values_in_single_quotes() {
        assert_eq!(shell_quote("hello"), "'hello'");
    }

    #[test]
    fn escapes_embedded_single_quotes() {
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }
}
