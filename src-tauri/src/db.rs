//! `project.sqlite` schema and migrations, versioned with `PRAGMA user_version`.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::error::{AppError, AppResult};

pub const SCHEMA_VERSION: i32 = 7;

/// Ordered migrations; entry `i` upgrades the schema from version `i` to `i + 1`.
const MIGRATIONS: &[&str] = &[r#"
CREATE TABLE project (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE TABLE conversations (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    created_at        INTEGER NOT NULL,
    last_activity_at  INTEGER NOT NULL,
    last_seq          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
    conversation_id  TEXT NOT NULL REFERENCES conversations(id),
    seq              INTEGER NOT NULL,
    id               TEXT NOT NULL UNIQUE,
    type             TEXT NOT NULL,
    ts               INTEGER NOT NULL,
    body             TEXT NOT NULL,
    PRIMARY KEY (conversation_id, seq)
);

CREATE TABLE messages (
    id               TEXT PRIMARY KEY,
    conversation_id  TEXT NOT NULL REFERENCES conversations(id),
    author_kind      TEXT NOT NULL,
    author_id        TEXT NOT NULL,
    content          TEXT NOT NULL,
    status           TEXT NOT NULL,
    reply_to         TEXT,
    attachments      TEXT NOT NULL,
    text_components  TEXT NOT NULL,
    created_at       INTEGER NOT NULL
);
CREATE INDEX messages_by_status ON messages(conversation_id, status);

CREATE TABLE reactions (
    message_id  TEXT NOT NULL REFERENCES messages(id),
    emoji       TEXT NOT NULL,
    by_kind     TEXT NOT NULL,
    by_id       TEXT NOT NULL,
    PRIMARY KEY (message_id, emoji, by_kind, by_id)
);

CREATE TABLE assets (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    media_type  TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    source      TEXT NOT NULL,
    rel_path    TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
"#,
    r#"
CREATE TABLE components (
    id          TEXT PRIMARY KEY,
    message_id  TEXT NOT NULL REFERENCES messages(id),
    kind        TEXT NOT NULL,
    version     INTEGER NOT NULL,
    data        TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
CREATE INDEX components_by_message ON components(message_id, created_at);
"#,
    r#"
CREATE TABLE message_steps (
    message_id  TEXT NOT NULL REFERENCES messages(id),
    position    INTEGER NOT NULL,
    step_id     TEXT NOT NULL,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    output      TEXT,
    done        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (message_id, position)
);

ALTER TABLE components ADD COLUMN answer TEXT;

-- What a reply paused at an approval needs to resume. Not derived from events: it is
-- deleted once the approval is answered or the reply is stopped.
CREATE TABLE paused_runs (
    message_id    TEXT PRIMARY KEY REFERENCES messages(id),
    step_id       TEXT NOT NULL,
    component_id  TEXT NOT NULL,
    run           TEXT NOT NULL,
    output        TEXT,
    state         TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);
"#,
    r#"
-- The Project Overview's own state: the summary the user asked for and the component they
-- featured. Always exactly one row.
CREATE TABLE overview (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    summary             TEXT,
    summary_at          INTEGER,
    featured_component  TEXT REFERENCES components(id)
);
INSERT INTO overview (id) VALUES (1);
"#,
    r#"
-- The position in its reply's message_steps (minus 1) of the Step run that added it.
ALTER TABLE components ADD COLUMN step_index INTEGER;
"#,
    r#"
-- Who added an Asset, when the core records it rather than leaving it to the first message
-- that attaches it, such as Scribe for a document it drafted; null when nothing was recorded.
ALTER TABLE assets ADD COLUMN added_by_kind TEXT;
ALTER TABLE assets ADD COLUMN added_by_id TEXT;
"#,
    r#"
-- Every Asset records its author when it is created. Those stored before then get the author
-- of the first message that attaches them, else, for one the user imported, the user.
UPDATE assets SET (added_by_kind, added_by_id) = (
    SELECT m.author_kind, m.author_id FROM messages m, json_each(m.attachments) a
    WHERE json_extract(a.value, '$.id') = assets.id ORDER BY m.rowid LIMIT 1
) WHERE added_by_kind IS NULL;
UPDATE assets SET added_by_kind = 'user', added_by_id = COALESCE(
    (SELECT author_id FROM messages WHERE author_kind = 'user' LIMIT 1), ''
) WHERE added_by_kind IS NULL AND source = 'upload';
"#,
];

fn user_version(conn: &Connection) -> AppResult<i32> {
    Ok(conn.pragma_query_value(None, "user_version", |row| row.get(0))?)
}

/// Opens (creating if needed) a Project database and brings it to `SCHEMA_VERSION`.
/// A database from a newer app version is refused before anything is written.
pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    let version = user_version(&conn)?;
    if version > SCHEMA_VERSION {
        return Err(AppError::new(
            "schema_too_new",
            "This Project was created by a newer version of Mini-Me. Update Mini-Me to open it.",
        ));
    }
    conn.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(()))?;
    conn.pragma_update(None, "foreign_keys", true)?;

    if version < SCHEMA_VERSION {
        let tx = conn.unchecked_transaction()?;
        for migration in &MIGRATIONS[version as usize..SCHEMA_VERSION as usize] {
            tx.execute_batch(migration)?;
        }
        tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        tx.commit()?;
    }
    Ok(conn)
}

/// Whether the database was made by a newer app version than this one.
pub fn is_newer(conn: &Connection) -> AppResult<bool> {
    Ok(user_version(conn)? > SCHEMA_VERSION)
}

/// Opens a Project database for reading only, without migrating it.
pub fn open_read_only(path: &Path) -> AppResult<Connection> {
    Ok(Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_database_is_migrated() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open(&dir.path().join("project.sqlite")).unwrap();
        assert_eq!(user_version(&conn).unwrap(), SCHEMA_VERSION);
        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN \
                 ('project', 'conversations', 'events', 'messages', 'reactions', 'assets', \
                 'components')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 7);
    }

    #[test]
    fn a_version_1_database_keeps_its_messages_when_migrated() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.sqlite");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATIONS[0]).unwrap();
            conn.pragma_update(None, "user_version", 1).unwrap();
            conn.execute_batch(
                "INSERT INTO conversations (id, title, created_at, last_activity_at) \
                 VALUES ('c', 'Trial', 1, 1); \
                 INSERT INTO messages (id, conversation_id, author_kind, author_id, content, \
                 status, attachments, text_components, created_at) \
                 VALUES ('m', 'c', 'user', 'u', 'late blight', 'complete', '[]', '[]', 1);",
            )
            .unwrap();
        }
        let conn = open(&path).unwrap();
        assert_eq!(user_version(&conn).unwrap(), SCHEMA_VERSION);
        let content: String = conn
            .query_row("SELECT content FROM messages WHERE id = 'm'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(content, "late blight");
        let components: i64 = conn
            .query_row("SELECT COUNT(*) FROM components", [], |row| row.get(0))
            .unwrap();
        assert_eq!(components, 0);
    }

    #[test]
    fn a_version_2_database_gains_steps_answers_and_paused_runs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.sqlite");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATIONS[0]).unwrap();
            conn.execute_batch(MIGRATIONS[1]).unwrap();
            conn.pragma_update(None, "user_version", 2).unwrap();
        }
        let conn = open(&path).unwrap();
        assert_eq!(user_version(&conn).unwrap(), SCHEMA_VERSION);
        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN \
                 ('message_steps', 'paused_runs')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 2);
        conn.prepare("SELECT answer FROM components").unwrap();
    }

    #[test]
    fn a_version_3_database_gains_an_empty_overview() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.sqlite");
        {
            let conn = Connection::open(&path).unwrap();
            for migration in &MIGRATIONS[..3] {
                conn.execute_batch(migration).unwrap();
            }
            conn.pragma_update(None, "user_version", 3).unwrap();
        }
        let conn = open(&path).unwrap();
        assert_eq!(user_version(&conn).unwrap(), SCHEMA_VERSION);
        let (summary, featured): (Option<String>, Option<String>) = conn
            .query_row("SELECT summary, featured_component FROM overview", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!((summary, featured), (None, None));
    }

    #[test]
    fn a_version_6_database_fills_in_who_added_each_asset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.sqlite");
        {
            let conn = Connection::open(&path).unwrap();
            for migration in &MIGRATIONS[..6] {
                conn.execute_batch(migration).unwrap();
            }
            conn.pragma_update(None, "user_version", 6).unwrap();
            conn.execute_batch(
                "INSERT INTO conversations (id, title, created_at, last_activity_at) \
                 VALUES ('c', 'Trial', 1, 1); \
                 INSERT INTO messages (id, conversation_id, author_kind, author_id, content, \
                 status, attachments, text_components, created_at) VALUES \
                 ('m1', 'c', 'user', 'u', 'plot it', 'complete', '[]', '[]', 1), \
                 ('m2', 'c', 'mini_me', 'plotter', 'done', 'complete', \
                 '[{\"id\":\"saved\",\"name\":\"plot.csv\",\"media_type\":\"text/csv\",\
                 \"size_bytes\":1}]', '[]', 2); \
                 INSERT INTO assets (id, name, media_type, size_bytes, source, rel_path, \
                 created_at) VALUES \
                 ('saved', 'plot.csv', 'text/csv', 1, 'generated', 'assets/saved/plot.csv', 2), \
                 ('upload', 'trial.csv', 'text/csv', 1, 'upload', 'assets/upload/trial.csv', 1);",
            )
            .unwrap();
        }
        let conn = open(&path).unwrap();
        let added_by = |id: &str| -> (String, String) {
            conn.query_row(
                "SELECT added_by_kind, added_by_id FROM assets WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap()
        };
        assert_eq!(added_by("saved"), ("mini_me".into(), "plotter".into()));
        assert_eq!(added_by("upload"), ("user".into(), "u".into()));
    }

    #[test]
    fn newer_database_is_refused_and_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.sqlite");
        {
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
                .unwrap();
        }
        let before = std::fs::read(&path).unwrap();

        let err = open(&path).unwrap_err();
        assert_eq!(err.code, "schema_too_new");
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }
}
