//! The most recently active Conversations across every Project, for Home's sidebar. Each
//! Project's database is only read, so listing never migrates a Project or changes its files.

use std::path::Path;

use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

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
        "SELECT id, title, last_activity_at FROM conversations \
         ORDER BY last_activity_at DESC LIMIT {RECENT_COUNT}"
    ))?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
    })?;
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
        });
    }
    Ok(recent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversations;
    use crate::db;
    use crate::projects::test_support::origin;
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
        let root = projects::ensure_data_root(dir.path()).unwrap();
        project(&root, "Trials", &[1, 6, 8]);
        project(&root, "Survey", &[2, 7]);
        project(&root, "Papers", &[3, 4, 5]);

        let titles: Vec<String> = list(&root).unwrap().into_iter().map(|c| c.title).collect();
        assert_eq!(titles, ["Trials 8", "Survey 7", "Trials 6", "Papers 5", "Papers 4"]);
    }

    #[test]
    fn a_project_from_a_newer_app_is_skipped_and_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let root = projects::ensure_data_root(dir.path()).unwrap();
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
}
