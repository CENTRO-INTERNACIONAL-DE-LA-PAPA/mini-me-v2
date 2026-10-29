//! Replies paused at an approval, gathered across every Project for Home. Each Project's
//! database is only read, so listing never migrates a Project or changes its files.

use std::path::Path;

use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::comments;
use crate::error::AppResult;
use crate::link::RunMiniMe;
use crate::projects::{self, ProjectSummary};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PausedApproval {
    pub project_id: Uuid,
    pub project_name: String,
    pub conversation_id: Uuid,
    pub conversation_title: String,
    pub message_id: Uuid,
    pub mini_me: RunMiniMe,
    pub prompt: String,
    /// When the reply paused (Unix ms).
    pub paused_at: i64,
}

/// Every paused approval in the Projects of `data_root`, newest pause first. A Project that
/// cannot be read, or whose schema is newer than this app's, is left out.
pub fn list(data_root: &Path) -> AppResult<Vec<PausedApproval>> {
    let mut approvals = projects::read_each(data_root, rows)?;
    approvals.sort_by_key(|a| std::cmp::Reverse(a.paused_at));
    Ok(approvals)
}

fn rows(project: &ProjectSummary, conn: &Connection) -> AppResult<Vec<PausedApproval>> {
    let mut statement = conn.prepare(&format!(
        "SELECT p.message_id, p.run, p.created_at, m.conversation_id, c.title, k.data \
         FROM paused_runs p \
         JOIN messages m ON m.id = p.message_id \
         JOIN conversations c ON c.id = m.conversation_id \
         JOIN components k ON k.id = p.component_id WHERE {}",
        comments::not_a_thread(conn, "c.id")?
    ))?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;
    let mut approvals = Vec::new();
    for row in rows {
        let (message_id, run, paused_at, conversation_id, title, data) = row?;
        let run: Value = serde_json::from_str(&run)?;
        let data: Value = serde_json::from_str(&data)?;
        // The saved run is a `RunSpec` under `spec`, which names the Mini-Me.
        let Some(mini_me) = run
            .pointer("/spec/mini_me")
            .and_then(|m| serde_json::from_value::<RunMiniMe>(m.clone()).ok())
        else {
            continue;
        };
        let (Ok(message_id), Ok(conversation_id)) =
            (Uuid::parse_str(&message_id), Uuid::parse_str(&conversation_id))
        else {
            continue;
        };
        approvals.push(PausedApproval {
            project_id: project.id,
            project_name: project.name.clone(),
            conversation_id,
            conversation_title: title,
            message_id,
            mini_me,
            prompt: data.get("prompt").and_then(Value::as_str).unwrap_or_default().to_string(),
            paused_at,
        });
    }
    Ok(approvals)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversations::{self, PausedRun, SendMessageInput};
    use crate::comments::test_support::into_thread;
    use crate::db;
    use crate::projects::test_support::origin;
    use crate::protocol::{Author, AuthorKind, new_id};
    use crate::store::Project;

    /// A Project in `root` with a reply by `mini_me` paused at `prompt` at time `at`.
    fn paused(root: &Path, name: &str, mini_me: &str, prompt: &str, at: i64) -> (Project, PausedRun) {
        let summary = projects::create(root, name).unwrap();
        let project = projects::open(&summary, origin()).unwrap();
        let conversation = conversations::create(&project).unwrap().id;
        let input = SendMessageInput {
            content: "q".into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let question = conversations::send_message(&project, conversation, input, new_id()).unwrap();
        let author = Author { kind: AuthorKind::MiniMe, id: new_id().to_string() };
        let reply = conversations::start_reply(&project, conversation, question.id, author).unwrap();
        let run = PausedRun {
            message_id: reply,
            step_id: "ask".into(),
            component_id: new_id(),
            run: serde_json::json!({ "spec": { "mini_me": { "id": new_id(), "name": mini_me } } }),
            output: None,
            state: "opaque".into(),
        };
        conversations::pause_reply(&project, run.clone(), prompt).unwrap();
        project
            .lock()
            .conn
            .execute("UPDATE paused_runs SET created_at = ?1", [at])
            .unwrap();
        (project, run)
    }

    #[test]
    fn approvals_from_every_project_are_listed_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        paused(&root, "Late blight resistance", "Investigator", "Design an experiment?", 1);
        paused(&root, "Seed potato virus survey", "Planner", "Confirm the sites?", 2);

        let approvals = list(&root).unwrap();
        let listed: Vec<_> = approvals
            .iter()
            .map(|a| (a.project_name.as_str(), a.mini_me.name.as_str(), a.prompt.as_str()))
            .collect();
        assert_eq!(
            listed,
            [
                ("Seed potato virus survey", "Planner", "Confirm the sites?"),
                ("Late blight resistance", "Investigator", "Design an experiment?"),
            ]
        );
    }

    #[test]
    fn an_answered_approval_is_not_listed() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        let (project, run) = paused(&root, "Trials", "Investigator", "Go on?", 1);
        conversations::answer_approval(&project, run.message_id, run.component_id, false).unwrap();
        assert!(list(&root).unwrap().is_empty());
    }

    #[test]
    fn a_project_from_a_newer_app_is_skipped_and_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        paused(&root, "Trials", "Investigator", "Go on?", 1);
        let (newer, _) = paused(&root, "Newer", "Planner", "Confirm?", 2);
        let database = newer.paths.database();
        drop(newer);
        {
            let conn = Connection::open(&database).unwrap();
            conn.pragma_update(None, "user_version", db::SCHEMA_VERSION + 1).unwrap();
        }
        let before = std::fs::read(&database).unwrap();

        let approvals = list(&root).unwrap();
        assert_eq!(approvals.len(), 1);
        assert_eq!(approvals[0].project_name, "Trials");
        assert_eq!(std::fs::read(&database).unwrap(), before);
    }

    #[test]
    fn an_approval_in_a_thread_is_not_listed() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        let (project, run) = paused(&root, "Trial", "Investigator", "Go ahead?", 1);
        let (conversation, _) = project.lock().message_place(run.message_id).unwrap().unwrap();
        into_thread(&project, conversation);
        assert!(list(&root).unwrap().is_empty());
    }
}
