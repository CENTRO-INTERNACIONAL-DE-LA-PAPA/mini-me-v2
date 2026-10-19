//! The check an Interactive Component from a Trait passes before it is stored. Each kind is
//! hand-coded in the UI (`src/components/interactive/<kind>.tsx`); which kinds a Trait adds
//! is up to the show tools its adapter uses, so the core does not check the kind against the
//! Trait.

use serde_json::Value;

use crate::error::{AppError, AppResult};

/// The most bytes a component's `data` may take as JSON.
pub const MAX_DATA_BYTES: usize = 2 * 1024 * 1024;

/// Kinds only the core creates, such as the approval a paused Workflow waits on.
const CORE_KINDS: [&str; 1] = ["approval"];

/// Refuses a component of a kind only the core creates (`component_not_allowed`), and one
/// with an empty `text` or `data` larger than `MAX_DATA_BYTES` (`invalid_component`).
pub fn check(kind: &str, data: &Value, text: &str) -> AppResult<()> {
    if CORE_KINDS.contains(&kind) {
        return Err(AppError::new(
            "component_not_allowed",
            format!("Only Mini-Me itself adds \"{kind}\" components."),
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

    #[test]
    fn any_kind_with_text_passes() {
        assert!(check("paper-sources", &json!({ "papers": [] }), "none").is_ok());
        assert!(check("theories", &json!({}), "t").is_ok());
    }

    #[test]
    fn an_approval_from_a_trait_is_refused() {
        let err = check("approval", &json!({}), "t").unwrap_err();
        assert_eq!(err.code, "component_not_allowed");
    }

    #[test]
    fn empty_text_or_too_much_data_is_refused() {
        let err = check("paper-sources", &json!({}), "  ").unwrap_err();
        assert_eq!(err.code, "invalid_component");
        let big = json!({ "papers": "x".repeat(MAX_DATA_BYTES) });
        let err = check("paper-sources", &big, "t").unwrap_err();
        assert_eq!(err.code, "invalid_component");
    }
}
