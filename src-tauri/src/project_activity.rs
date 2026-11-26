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
