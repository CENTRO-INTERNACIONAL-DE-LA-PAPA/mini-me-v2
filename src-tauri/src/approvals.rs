//! Replies paused at an approval, gathered across every Project for Home. Each Project's
//! database is only read, so listing never migrates a Project or changes its files.

use std::collections::HashMap;
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

/// The saved run is a `RunSpec` under `spec`, which names its Mini-Me.
fn mini_me_of(run: &Value) -> Option<RunMiniMe> {
    serde_json::from_value(run.pointer("/spec/mini_me")?.clone()).ok()
}

/// The Mini-Me of the reply paused in each Conversation of the Project behind `conn`.
pub fn paused_mini_mes(conn: &Connection) -> AppResult<HashMap<Uuid, RunMiniMe>> {
    let mut statement = conn.prepare(
        "SELECT m.conversation_id, p.run FROM paused_runs p JOIN messages m ON m.id = p.message_id",
    )?;
    let rows = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    let mut paused = HashMap::new();
    for row in rows {
        let (conversation_id, run) = row?;
        let (Ok(conversation_id), Ok(run)) =
            (Uuid::parse_str(&conversation_id), serde_json::from_str::<Value>(&run))
        else {
            continue;
        };
        if let Some(mini_me) = mini_me_of(&run) {
            paused.insert(conversation_id, mini_me);
        }
    }
    Ok(paused)
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
        "SELECT p.message_id, p.run, p.created_at, m.conversation_id, c.title, k.preview \
         FROM paused_runs p \
         JOIN messages m ON m.id = p.message_id \
         JOIN conversations c ON c.id = m.conversation_id \
         JOIN components k ON k.id = p.component_id WHERE {}",
        comments::not_a_thread("c.id")
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
        let (message_id, run, paused_at, conversation_id, title, preview) = row?;
        let run: Value = serde_json::from_str(&run)?;
        let preview: Value = serde_json::from_str(&preview)?;
        let Some(mini_me) = mini_me_of(&run) else {
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
            prompt: preview
                .get("prompt")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            paused_at,
        });
    }
    Ok(approvals)
}
