//! `project.sqlite` schema and migrations, versioned with `PRAGMA user_version`.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use crate::error::{AppError, AppResult};

pub const SCHEMA_VERSION: i32 = 1;

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
"#];

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
                 ('project', 'conversations', 'events', 'messages', 'reactions', 'assets')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 6);
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
