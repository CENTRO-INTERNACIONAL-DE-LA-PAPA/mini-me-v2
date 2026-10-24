//! The check an Interactive Component from a Trait passes before it is stored. Each kind is
//! hand-coded in the UI (`src/components/interactive/<kind>.tsx`); which kinds a Trait adds
//! is up to the show tools its adapter uses, so the core does not check the kind against the
//! Trait.

use serde_json::{Value, json};
use uuid::Uuid;

use crate::assets;
use crate::error::{AppError, AppResult};
use crate::store::ProjectState;

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

/// The Asset holding a `table` component's full table: its `source_id`, when that is an Asset
/// of the Project.
pub fn source_asset_id(state: &ProjectState, data: &Value) -> Option<Uuid> {
    data["source_id"]
        .as_str()
        .and_then(|id| Uuid::parse_str(id).ok())
        .filter(|id| assets::find(state, *id).is_ok())
}

/// The answer to a call's `component.read`: a component of `conversation_id` with, for a
/// `table`, the Asset that holds its full table (`source_asset_id`, else `null`).
pub fn read(state: &ProjectState, conversation_id: Uuid, component_id: Uuid) -> AppResult<Value> {
    let component = state
        .conversation_component(conversation_id, component_id)?
        .ok_or_else(|| AppError::not_found("No such component in this Conversation."))?;
    let source_asset_id = match component.kind.as_str() {
        "table" => source_asset_id(state, &component.data),
        _ => None,
    };
    Ok(json!({
        "kind": component.kind,
        "version": component.version,
        "data": component.data,
        "text": component.text,
        "source_asset_id": source_asset_id,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::temp_project;
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

    #[test]
    fn a_table_names_its_source_asset_only_when_the_project_has_it() {
        let (dir, project) = temp_project();
        let source = dir.path().join("trial.csv");
        std::fs::write(&source, "yield\n1").unwrap();
        let asset = assets::import(&project, &source).unwrap();
        let state = project.lock();

        let preview = json!({ "source": "trial.csv", "source_id": asset.id });
        assert_eq!(source_asset_id(&state, &preview), Some(asset.id));
        let missing = json!({ "source": "trial.csv", "source_id": uuid::Uuid::now_v7() });
        assert_eq!(source_asset_id(&state, &missing), None);
        assert_eq!(source_asset_id(&state, &json!({ "source": "trial.csv" })), None);
    }

    #[test]
    fn reading_a_table_names_the_asset_of_its_full_table() {
        use crate::conversations::{add_component, create, send_message, start_reply};
        use crate::protocol::{Author, AuthorKind, new_id};

        let (dir, project) = temp_project();
        let source = dir.path().join("trial.csv");
        std::fs::write(&source, "yield\n1").unwrap();
        let asset = assets::import(&project, &source).unwrap();
        let conversation = create(&project).unwrap().id;
        let input = serde_json::from_value(json!({ "content": "profile" })).unwrap();
        let question = send_message(&project, conversation, input, new_id()).unwrap();
        let author = Author { kind: AuthorKind::MiniMe, id: "profiler".into() };
        let reply = start_reply(&project, conversation, question.id, author).unwrap();
        let columns = json!([{ "name": "yield", "type": "number" }]);
        let preview = json!({ "columns": columns, "rows": [[1]], "source_id": asset.id });
        let table = add_component(&project, reply, ("table", 1, preview, "t".into())).unwrap();
        let plain = json!({ "columns": columns, "rows": [[1]] });
        let other = add_component(&project, reply, ("table", 1, plain, "t".into())).unwrap();

        let state = project.lock();
        let read = read(&state, conversation, table).unwrap();
        assert_eq!(read["source_asset_id"], json!(asset.id));
        assert_eq!(read["data"]["rows"], json!([[1]]));
        let plain = super::read(&state, conversation, other).unwrap();
        assert_eq!(plain["source_asset_id"], json!(null));
        assert_eq!(super::read(&state, new_id(), table).unwrap_err().code, "not_found");
    }
}
