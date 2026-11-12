//! What Home's Project cards show beyond a Project's name: when it was last active, which
//! Mini-Mes replied in it, and its Overview summary. Each Project's database is only read, so
//! listing never migrates a Project or changes its files.

use std::path::Path;

use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::comments;
use crate::error::AppResult;
use crate::projects::{self, ProjectSummary};

/// How many Mini-Mes a Project card shows.
const MINI_ME_COUNT: usize = 4;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProjectActivity {
    pub project_id: Uuid,
    /// Unix ms of the latest activity in any of its Conversations; none without Conversations.
    pub last_activity_at: Option<i64>,
    /// The Mini-Mes that replied in it, the latest to reply first.
    pub mini_mes: Vec<Uuid>,
    /// The Overview's summary as stored, with names marked; none until one is written.
    pub summary: Option<String>,
}

/// The activity of each Project of `data_root` that can be read.
pub fn list(data_root: &Path) -> AppResult<Vec<ProjectActivity>> {
    projects::read_each(data_root, |project, conn| Ok(vec![read(project, conn)?]))
}

fn read(project: &ProjectSummary, conn: &Connection) -> AppResult<ProjectActivity> {
    let conversations_only = comments::not_a_thread("id");
    let last_activity_at: Option<i64> = conn.query_row(
        &format!("SELECT MAX(last_activity_at) FROM conversations WHERE {conversations_only}"),
        [],
        |row| row.get(0),
    )?;
    let mut statement = conn.prepare(&format!(
        "SELECT author_id FROM messages WHERE author_kind = 'mini_me' AND {} \
         GROUP BY author_id ORDER BY MAX(created_at) DESC LIMIT {MINI_ME_COUNT}",
        comments::not_a_thread("conversation_id")
    ))?;
    let mini_mes = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(|id| Uuid::parse_str(&id.ok()?).ok())
        .collect();
    let summary = conn.query_row("SELECT summary FROM overview WHERE id = 1", [], |row| row.get(0))?;
    Ok(ProjectActivity { project_id: project.id, last_activity_at, mini_mes, summary })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversations;
    use crate::overview;
    use crate::projects::test_support::origin;
    use crate::protocol::new_id;

    /// Adds a reply by `mini_me` at `at` to the Conversation `conversation_id`.
    fn reply(project: &crate::store::Project, conversation_id: Uuid, mini_me: Uuid, at: i64) {
        project
            .lock()
            .conn
            .execute(
                "INSERT INTO messages (id, conversation_id, author_kind, author_id, content, \
                 status, attachments, text_components, created_at) \
                 VALUES (?1, ?2, 'mini_me', ?3, 'ok', 'complete', '[]', '[]', ?4)",
                rusqlite::params![
                    new_id().to_string(),
                    conversation_id.to_string(),
                    mini_me.to_string(),
                    at
                ],
            )
            .unwrap();
    }

    #[test]
    fn a_project_lists_its_latest_mini_mes_activity_and_summary() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        let summary = projects::create(&root, "Trials").unwrap();
        let project = projects::open(&summary, origin()).unwrap();
        let conversation = conversations::create(&project).unwrap().id;
        let mini_mes: Vec<Uuid> = (0..5).map(|_| new_id()).collect();
        for (at, mini_me) in mini_mes.iter().enumerate() {
            reply(&project, conversation, *mini_me, at as i64);
        }
        reply(&project, conversation, mini_mes[0], 10);
        overview::save_summary(&project, "Yield rose. More trials are pending.", 11).unwrap();

        let activity = list(&root).unwrap().remove(0);
        assert_eq!(activity.mini_mes, [mini_mes[0], mini_mes[4], mini_mes[3], mini_mes[2]]);
        assert!(activity.last_activity_at.is_some());
        assert_eq!(activity.summary.as_deref(), Some("Yield rose. More trials are pending."));
    }

    #[test]
    fn a_new_project_has_no_activity() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        projects::create(&root, "Empty").unwrap();

        let activity = list(&root).unwrap().remove(0);
        assert_eq!(activity.last_activity_at, None);
        assert!(activity.mini_mes.is_empty());
        assert_eq!(activity.summary, None);
    }
}
