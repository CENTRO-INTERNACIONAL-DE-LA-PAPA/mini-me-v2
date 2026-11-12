//! The most recently active Conversations across every Project, for Home's sidebar. Each
//! Project's database is only read, so listing never migrates a Project or changes its files.

use std::path::Path;

use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::approvals;
use crate::comments;
use crate::conversations::ConversationStatus;
use crate::error::AppResult;
use crate::projects::{self, ProjectSummary};

/// How many Conversations Home's sidebar lists.
const RECENT_COUNT: usize = 5;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RecentConversation {
    pub project_id: Uuid,
    pub project_name: String,
    pub conversation_id: Uuid,
    pub title: String,
    /// Unix ms.
    pub last_activity_at: i64,
    /// What the latest reply is doing, when it is running or waits for an approval.
    pub status: Option<ConversationStatus>,
}

/// The most recently active Conversations in the Projects of `data_root`, newest first.
pub fn list(data_root: &Path) -> AppResult<Vec<RecentConversation>> {
    let mut recent = projects::read_each(data_root, rows)?;
    recent.sort_by_key(|c| std::cmp::Reverse(c.last_activity_at));
    recent.truncate(RECENT_COUNT);
    Ok(recent)
}

fn rows(project: &ProjectSummary, conn: &Connection) -> AppResult<Vec<RecentConversation>> {
    let mut statement = conn.prepare(&format!(
        "SELECT id, title, last_activity_at FROM conversations WHERE {} \
         ORDER BY last_activity_at DESC LIMIT {RECENT_COUNT}",
        comments::not_a_thread("id")
    ))?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
    })?;
    let paused = approvals::paused_mini_mes(conn)?;
    let mut recent = Vec::new();
    for row in rows {
        let (id, title, last_activity_at) = row?;
        let Ok(conversation_id) = Uuid::parse_str(&id) else {
            continue;
        };
        recent.push(RecentConversation {
            project_id: project.id,
            project_name: project.name.clone(),
            conversation_id,
            title,
            last_activity_at,
            status: paused
                .get(&conversation_id)
                .map(|mini_me| ConversationStatus::NeedsApproval { mini_me: mini_me.clone() }),
        });
    }
    Ok(recent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversations;
    use crate::comments::test_support::into_thread;
    use crate::db;
    use crate::projects::test_support::origin;
    use crate::protocol::{Author, AuthorKind, new_id};
    use crate::store::Project;

    /// A Project in `root` with one Conversation per activity time in `activity`.
    fn project(root: &Path, name: &str, activity: &[i64]) -> Project {
        let summary = projects::create(root, name).unwrap();
        let project = projects::open(&summary, origin()).unwrap();
        for at in activity {
            let id = conversations::create(&project).unwrap().id;
            project
                .lock()
                .conn
                .execute(
                    "UPDATE conversations SET title = ?1, last_activity_at = ?2 WHERE id = ?3",
                    rusqlite::params![format!("{name} {at}"), at, id.to_string()],
                )
                .unwrap();
        }
        project
    }

    #[test]
    fn the_five_latest_conversations_across_projects_are_listed_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        project(&root, "Trials", &[1, 6, 8]);
        project(&root, "Survey", &[2, 7]);
        project(&root, "Papers", &[3, 4, 5]);

        let titles: Vec<String> = list(&root).unwrap().into_iter().map(|c| c.title).collect();
        assert_eq!(titles, ["Trials 8", "Survey 7", "Trials 6", "Papers 5", "Papers 4"]);
    }

    #[test]
    fn a_paused_reply_gives_its_recent_conversation_a_status() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        let trial = project(&root, "Trials", &[1, 2]);
        project(&root, "Survey", &[3]);
        let paused = conversations::list(&trial).unwrap()[0].id;
        let input = conversations::SendMessageInput {
            content: "q".into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let question = conversations::send_message(&trial, paused, input, new_id()).unwrap();
        let author = Author { kind: AuthorKind::MiniMe, id: new_id().to_string() };
        let reply = conversations::start_reply(&trial, paused, question.id, author).unwrap();
        let mini_me = crate::link::RunMiniMe { id: new_id(), name: "Investigator".into() };
        let run = conversations::PausedRun {
            message_id: reply,
            step_id: "ask".into(),
            component_id: new_id(),
            run: serde_json::json!({ "spec": { "mini_me": mini_me } }),
            output: None,
            state: "opaque".into(),
        };
        conversations::pause_reply(&trial, run, "Go on?").unwrap();

        let status = |c: &RecentConversation| c.status.clone();
        let recent = list(&root).unwrap();
        let by_project = |name: &str| recent.iter().find(|c| c.project_name == name).unwrap();
        assert_eq!(
            status(by_project("Trials")),
            Some(ConversationStatus::NeedsApproval { mini_me })
        );
        assert_eq!(status(by_project("Survey")), None);
    }

    #[test]
    fn a_project_from_a_newer_app_is_skipped_and_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        project(&root, "Trials", &[1]);
        let newer = project(&root, "Newer", &[2]);
        let database = newer.paths.database();
        drop(newer);
        {
            let conn = Connection::open(&database).unwrap();
            conn.pragma_update(None, "user_version", db::SCHEMA_VERSION + 1).unwrap();
        }
        let before = std::fs::read(&database).unwrap();

        let recent = list(&root).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].project_name, "Trials");
        assert_eq!(std::fs::read(&database).unwrap(), before);
    }

    #[test]
    fn a_thread_is_not_a_recent_conversation() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path(), projects::DATA_FOLDER_NAME).unwrap();
        let trial = project(&root, "Trial", &[1, 2]);
        let newest = conversations::list(&trial).unwrap()[0].id;
        into_thread(&trial, newest);
        let titles: Vec<String> = list(&root).unwrap().into_iter().map(|c| c.title).collect();
        assert_eq!(titles, ["Trial 1"]);
    }
}
