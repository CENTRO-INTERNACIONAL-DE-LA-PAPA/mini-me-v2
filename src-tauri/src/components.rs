//! The check an Interactive Component passes before it is stored. Each kind is hand-coded in
//! the UI (`src/components/interactive/<kind>.tsx`); a Trait lists the kinds its answers may
//! include, and only built-in Traits list any.

use serde_json::Value;

use crate::error::{AppError, AppResult};

/// The most bytes a component's `data` may take as JSON.
pub const MAX_DATA_BYTES: usize = 2 * 1024 * 1024;

/// Refuses a component of a kind the call's Trait does not list (`component_not_allowed`),
/// and one with an empty `text` or `data` larger than `MAX_DATA_BYTES` (`invalid_component`).
pub fn check(kind: &str, allowed: &[String], data: &Value, text: &str) -> AppResult<()> {
    if !allowed.iter().any(|k| k == kind) {
        return Err(AppError::new(
            "component_not_allowed",
            format!("This Trait does not show \"{kind}\" components."),
        ));
    }
    if text.trim().is_empty() {
        return Err(AppError::new("invalid_component", "The component's text is empty."));
    }
    if serde_json::to_vec(data)?.len() > MAX_DATA_BYTES {
        return Err(AppError::new(
            "invalid_component",
            format!("The {kind} component's data is larger than 2 MiB."),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn allowed() -> Vec<String> {
        vec!["paper-sources".to_string()]
    }

    #[test]
    fn a_listed_kind_with_text_passes() {
        assert!(check("paper-sources", &allowed(), &json!({ "papers": [] }), "none").is_ok());
    }

    #[test]
    fn a_kind_the_trait_does_not_list_is_refused() {
        let err = check("theories", &allowed(), &json!({}), "t").unwrap_err();
        assert_eq!(err.code, "component_not_allowed");
        let err = check("paper-sources", &[], &json!({}), "t").unwrap_err();
        assert_eq!(err.code, "component_not_allowed");
    }

    #[test]
    fn empty_text_or_too_much_data_is_refused() {
        let err = check("paper-sources", &allowed(), &json!({}), "  ").unwrap_err();
        assert_eq!(err.code, "invalid_component");
        let big = json!({ "papers": "x".repeat(MAX_DATA_BYTES) });
        let err = check("paper-sources", &allowed(), &big, "t").unwrap_err();
        assert_eq!(err.code, "invalid_component");
    }
}
