//! The check an Interactive Component from a Trait passes before it is stored. Each kind is drawn
//! by `src/components/interactive/<kind>.tsx`; the kind is not checked against the Trait, since
//! its adapter decides which kinds it adds.

use serde_json::{Value, json};
use uuid::Uuid;

use crate::assets;
use crate::error::{AppError, AppResult};
use crate::store::ProjectState;

/// The most bytes a component's `preview` may take as JSON.
pub const MAX_PREVIEW_BYTES: usize = 2 * 1024 * 1024;

/// Kinds only the core creates, such as a paused Workflow's approval and a reply's hand-off.
const CORE_KINDS: [&str; 3] = ["approval", "document-edits", "hand-off"];

/// Refuses a component of a kind only the core creates (`component_not_allowed`), and one
/// with an empty `text`, a `preview` larger than `MAX_PREVIEW_BYTES` or a source that is not an
/// Asset of the Project (`invalid_component`).
pub fn check(
    state: &ProjectState,
    kind: &str,
    (preview, text): (&Value, &str),
    source_asset_id: Option<Uuid>,
) -> AppResult<()> {
    if CORE_KINDS.contains(&kind) {
        return Err(AppError::new(
            "component_not_allowed",
            format!("Only Mini-Me itself adds \"{kind}\" components."),
        ));
    }
    if text.trim().is_empty() {
        return Err(AppError::new("invalid_component", "The component's text is empty."));
    }
    if serde_json::to_vec(preview)?.len() > MAX_PREVIEW_BYTES {
        return Err(AppError::new(
            "invalid_component",
            format!("The {kind} component's preview is larger than 2 MiB."),
        ));
    }
    if source_asset_id.is_some_and(|id| assets::find(state, id).is_err()) {
        return Err(AppError::new(
            "invalid_component",
            format!("The {kind} component's source file is not part of this Project."),
        ));
    }
    Ok(())
}

/// The answer to a call's `component.read`: a component of `conversation_id` without its
/// preview, with the Asset holding its data (`source_asset_id`, `null` when it has none or the
/// file was deleted).
pub fn read(state: &ProjectState, conversation_id: Uuid, component_id: Uuid) -> AppResult<Value> {
    let component = state
        .conversation_component(conversation_id, component_id)?
        .ok_or_else(|| AppError::not_found("No such component in this Conversation."))?;
    let source_asset_id = component
        .source_asset_id
        .filter(|id| assets::find(state, *id).is_ok());
    Ok(json!({
        "kind": component.kind,
        "version": component.version,
        "text": component.text,
        "source_asset_id": source_asset_id,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::{temp_project, user};
    use serde_json::json;

    #[test]
    fn a_traits_component_needs_text_a_small_preview_a_known_source_and_a_kind_traits_may_add() {
        let (dir, project) = temp_project();
        let source = dir.path().join("trial.csv");
        std::fs::write(&source, "yield\n1").unwrap();
        let asset = assets::import(&project, &source, &user()).unwrap();
        let state = project.lock();
        let code = |kind, preview: &Value, text, source| {
            check(&state, kind, (preview, text), source)
                .err()
                .map(|e| e.code)
        };

        assert_eq!(
            code("paper-sources", &json!({ "papers": [] }), "none", None),
            None
        );
        assert_eq!(code("table", &json!({}), "t", Some(asset.id)), None);
        for kind in ["approval", "hand-off"] {
            assert_eq!(
                code(kind, &json!({}), "t", None).as_deref(),
                Some("component_not_allowed")
            );
        }
        let big = json!({ "papers": "x".repeat(MAX_PREVIEW_BYTES) });
        for (preview, text, source) in [
            (json!({}), "  ", None),
            (big, "t", None),
            (json!({}), "t", Some(Uuid::now_v7())),
        ] {
            assert_eq!(
                code("table", &preview, text, source).as_deref(),
                Some("invalid_component")
            );
        }
    }

    #[test]
    fn reading_a_component_gives_its_text_and_source_but_not_its_preview() {
        use crate::conversations::{
            NewComponent, add_component, create, send_message, start_reply,
        };
        use crate::protocol::{Author, AuthorKind, new_id};

        let (dir, project) = temp_project();
        let source = dir.path().join("trial.csv");
        std::fs::write(&source, "yield\n1").unwrap();
        let asset = assets::import(&project, &source, &user()).unwrap();
        let conversation = create(&project).unwrap().id;
        let input = serde_json::from_value(json!({ "content": "profile" })).unwrap();
        let question = send_message(&project, conversation, input, new_id()).unwrap();
        let author = Author { kind: AuthorKind::MiniMe, id: "profiler".into() };
        let reply = start_reply(&project, conversation, question.id, author).unwrap();
        let preview = json!({ "columns": [{ "name": "yield", "type": "number" }], "rows": [[1]] });
        let component = |source_asset_id| NewComponent {
            kind: "table".into(),
            version: 1,
            preview: preview.clone(),
            text: "t".into(),
            source_asset_id,
        };
        let table = add_component(&project, reply, None, component(Some(asset.id))).unwrap();
        let other = add_component(&project, reply, None, component(None)).unwrap();

        let state = project.lock();
        let read = read(&state, conversation, table).unwrap();
        assert_eq!(
            read,
            json!({ "kind": "table", "version": 1, "text": "t", "source_asset_id": asset.id })
        );
        let plain = super::read(&state, conversation, other).unwrap();
        assert_eq!(plain["source_asset_id"], json!(null));
        assert_eq!(super::read(&state, new_id(), table).unwrap_err().code, "not_found");
    }
}
