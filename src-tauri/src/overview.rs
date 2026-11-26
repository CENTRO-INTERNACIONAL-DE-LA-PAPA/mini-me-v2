//! The Project Overview: its header counts, the summary the user asked for, the featured
//! component, and every output the Project's Conversations produced. The summary and the
//! featured component live in the one-row `overview` table of `project.sqlite`.

use std::collections::{HashMap, HashSet};

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use uuid::Uuid;

use crate::comments;
use crate::error::{AppError, AppResult};
use crate::library::Library;
use crate::protocol::{AssetRef, Author, AuthorKind, Component};
use crate::store::{Project, ProjectState, parse_id};

/// Component kinds that can be featured on the Overview.
const FEATURABLE: [&str; 2] = ["chart", "table"];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Overview {
    pub conversations: i64,
    /// In milliseconds; `None` without Conversations.
    pub last_activity_at: Option<i64>,
    pub summary: Option<String>,
    pub summary_at: Option<i64>,
    pub featured: Option<Featured>,
    /// Newest first.
    pub outputs: Vec<Output>,
}

/// The featured component, with its data, and the reply it belongs to.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Featured {
    pub component: Component,
    pub author: Author,
    pub conversation_id: Uuid,
    pub message_id: Uuid,
}

/// Something a Conversation produced: an Interactive Component other than an approval, or an
/// Asset a Mini-Me saved (`kind` is then `file` and `id` the Asset's).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Output {
    pub kind: String,
    pub id: Uuid,
    pub title: String,
    pub author: Author,
    pub conversation_id: Uuid,
    pub conversation_title: String,
    pub message_id: Uuid,
    pub created_at: i64,
}

fn author(kind: &str, id: String) -> AppResult<Author> {
    let kind =
        AuthorKind::parse(kind).ok_or_else(|| AppError::storage("stored author is not readable"))?;
    Ok(Author { kind, id })
}

/// The title an output card shows: a chart's or table's own title, a count of papers, theories
/// or matching datasets, or the first line of the component's text for other kinds.
fn component_title(kind: &str, title: Option<String>, count: Option<i64>, text: &str) -> String {
    match (kind, title, count) {
        ("chart" | "table", Some(title), _) if !title.trim().is_empty() => title,
        ("chart", _, _) => "Chart".into(),
        ("table", _, _) => "Table".into(),
        ("paper-sources", _, Some(1)) => "1 paper".into(),
        ("paper-sources", _, Some(n)) => format!("{n} papers"),
        ("theories", _, Some(1)) => "1 theory".into(),
        ("theories", _, Some(n)) => format!("{n} theories"),
        ("dataset-results", _, Some(1)) => "1 dataset".into(),
        ("dataset-results", _, Some(n)) => format!("{n} datasets"),
        _ => text.lines().next().unwrap_or(kind).to_string(),
    }
}

pub fn overview(project: &Project) -> AppResult<Overview> {
    let state = project.lock();
    let conn = &state.conn;
    let conversations_only = comments::not_a_thread("id");
    let (conversations, last_activity_at): (i64, Option<i64>) = conn.query_row(
        &format!(
            "SELECT COUNT(*), MAX(last_activity_at) FROM conversations WHERE {conversations_only}"
        ),
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let (summary, summary_at, featured_id): (Option<String>, Option<i64>, Option<String>) = conn
        .query_row(
            "SELECT summary, summary_at, featured_component FROM overview WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
    let featured = match featured_id {
        None => None,
        Some(id) => featured(conn, &id)?,
    };
    let mut outputs = component_outputs(conn)?;
    outputs.extend(file_outputs(conn)?);
    outputs.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(Overview {
        conversations,
        last_activity_at,
        summary,
        summary_at,
        featured,
        outputs,
    })
}

struct FeaturedRow {
    id: String,
    kind: String,
    version: u32,
    preview: String,
    text: String,
    source_asset_id: Option<String>,
    answer: Option<String>,
    author_kind: String,
    author_id: String,
    conversation: String,
    message: String,
}

/// The component `id` with its reply; `None` when it no longer exists.
fn featured(conn: &Connection, id: &str) -> AppResult<Option<Featured>> {
    let row = conn
        .query_row(
            "SELECT c.id, c.kind, c.version, c.preview, c.text, c.answer, m.author_kind, \
             m.author_id, m.conversation_id, m.id, c.source_asset_id FROM components c \
             JOIN messages m ON m.id = c.message_id WHERE c.id = ?1",
            params![id],
            |row| {
                Ok(FeaturedRow {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    version: row.get(2)?,
                    preview: row.get(3)?,
                    text: row.get(4)?,
                    source_asset_id: row.get(10)?,
                    answer: row.get(5)?,
                    author_kind: row.get(6)?,
                    author_id: row.get(7)?,
                    conversation: row.get(8)?,
                    message: row.get(9)?,
                })
            },
        )
        .optional()?;
    let Some(row) = row else {
        return Ok(None);
    };
    Ok(Some(Featured {
        component: Component {
            id: parse_id(&row.id, "ID")?,
            kind: row.kind,
            version: row.version,
            preview: serde_json::from_str(&row.preview)?,
            text: row.text,
            source_asset_id: row
                .source_asset_id
                .as_deref()
                .map(|id| parse_id(id, "ID"))
                .transpose()?,
            answer: row.answer.map(|a| serde_json::from_str(&a)).transpose()?.unwrap_or_default(),
            // The Overview draws the component on its own, outside its reply.
            step_index: None,
        },
        author: author(&row.author_kind, row.author_id)?,
        conversation_id: parse_id(&row.conversation, "ID")?,
        message_id: parse_id(&row.message, "ID")?,
    }))
}

struct ComponentOutputRow {
    kind: String,
    id: String,
    title: Option<String>,
    /// The length of its papers or theories, or its total of matching datasets.
    count: Option<i64>,
    text: String,
    author_kind: String,
    author_id: String,
    conversation: String,
    conversation_title: String,
    message: String,
    created_at: i64,
}

/// Every component of the Project's Conversations other than an approval, in no set order.
fn component_outputs(conn: &Connection) -> AppResult<Vec<Output>> {
    // Only the title and the list lengths are read from `preview`, which can be large.
    let in_conversations = comments::not_a_thread("v.id");
    let mut stmt = conn.prepare(&format!(
        "SELECT c.kind, c.id, json_extract(c.preview, '$.title'), \
         COALESCE(json_array_length(c.preview, '$.papers'), \
         json_array_length(c.preview, '$.theories'), json_extract(c.preview, '$.total')), \
         c.text, m.author_kind, m.author_id, m.conversation_id, v.title, m.id, c.created_at \
         FROM components c JOIN messages m ON m.id = c.message_id \
         JOIN conversations v ON v.id = m.conversation_id \
         WHERE c.kind != 'approval' AND {in_conversations}",
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok(ComponentOutputRow {
            kind: row.get(0)?,
            id: row.get(1)?,
            title: row.get(2)?,
            count: row.get(3)?,
            text: row.get(4)?,
            author_kind: row.get(5)?,
            author_id: row.get(6)?,
            conversation: row.get(7)?,
            conversation_title: row.get(8)?,
            message: row.get(9)?,
            created_at: row.get(10)?,
        })
    })?;
    let mut outputs = Vec::new();
    for row in rows {
        let row = row?;
        outputs.push(Output {
            title: component_title(&row.kind, row.title, row.count, &row.text),
            kind: row.kind,
            id: parse_id(&row.id, "ID")?,
            author: author(&row.author_kind, row.author_id)?,
            conversation_id: parse_id(&row.conversation, "ID")?,
            conversation_title: row.conversation_title,
            message_id: parse_id(&row.message, "ID")?,
            created_at: row.created_at,
        });
    }
    Ok(outputs)
}

struct GeneratedFile {
    name: String,
    created_at: i64,
}

struct AttachingMessage {
    message: String,
    author_kind: String,
    author_id: String,
    conversation: String,
    conversation_title: String,
    attachments: String,
}

/// Files Mini-Mes saved, each with the first message that attaches it, in no set order.
fn file_outputs(conn: &Connection) -> AppResult<Vec<Output>> {
    let generated: HashMap<Uuid, GeneratedFile> = {
        let mut stmt =
            conn.prepare("SELECT id, name, created_at FROM assets WHERE source = 'generated'")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                GeneratedFile { name: row.get(1)?, created_at: row.get(2)? },
            ))
        })?;
        let mut generated = HashMap::new();
        for row in rows {
            let (id, file) = row?;
            generated.insert(parse_id(&id, "ID")?, file);
        }
        generated
    };
    let mut outputs = Vec::new();
    if generated.is_empty() {
        return Ok(outputs);
    }
    let in_conversations = comments::not_a_thread("v.id");
    let mut stmt = conn.prepare(&format!(
        "SELECT m.id, m.author_kind, m.author_id, m.conversation_id, v.title, m.attachments \
         FROM messages m JOIN conversations v ON v.id = m.conversation_id \
         WHERE m.attachments != '[]' AND {in_conversations} ORDER BY m.rowid",
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok(AttachingMessage {
            message: row.get(0)?,
            author_kind: row.get(1)?,
            author_id: row.get(2)?,
            conversation: row.get(3)?,
            conversation_title: row.get(4)?,
            attachments: row.get(5)?,
        })
    })?;
    let mut seen = HashSet::new();
    for row in rows {
        let row = row?;
        let attached: Vec<AssetRef> = serde_json::from_str(&row.attachments)?;
        for asset in attached {
            let Some(file) = generated.get(&asset.id) else { continue };
            if !seen.insert(asset.id) {
                continue;
            }
            outputs.push(Output {
                kind: "file".into(),
                id: asset.id,
                title: file.name.clone(),
                author: author(&row.author_kind, row.author_id.clone())?,
                conversation_id: parse_id(&row.conversation, "ID")?,
                conversation_title: row.conversation_title.clone(),
                message_id: parse_id(&row.message, "ID")?,
                created_at: file.created_at,
            });
        }
    }
    Ok(outputs)
}

/// Features a chart or table, replacing any other; `None` clears it.
pub fn feature(project: &Project, component_id: Option<Uuid>) -> AppResult<()> {
    let state = project.lock();
    if let Some(id) = component_id {
        let kind: Option<String> = state
            .conn
            .query_row(
                "SELECT kind FROM components WHERE id = ?1",
                params![id.to_string()],
                |row| row.get(0),
            )
            .optional()?;
        match kind {
            None => return Err(AppError::not_found("That component is not part of this Project.")),
            Some(kind) if !FEATURABLE.contains(&kind.as_str()) => {
                return Err(AppError::invalid_input(
                    "Only charts and tables can be featured on the Overview.",
                ));
            }
            Some(_) => {}
        }
    }
    state.conn.execute(
        "UPDATE overview SET featured_component = ?1 WHERE id = 1",
        params![component_id.map(|id| id.to_string())],
    )?;
    Ok(())
}

/// `at` is when it was written, in milliseconds.
pub fn save_summary(project: &Project, summary: &str, at: i64) -> AppResult<()> {
    project.lock().conn.execute(
        "UPDATE overview SET summary = ?1, summary_at = ?2 WHERE id = 1",
        params![summary, at],
    )?;
    Ok(())
}

/// Each Conversation's title and messages as `You:` or `<Mini-Me name>:` lines, newest first, added
/// whole while within `budget` characters. Messages without text use their components' text; file
/// contents are never included.
pub fn summary_material(project: &Project, library: &Library, budget: usize) -> AppResult<String> {
    let state = project.lock();
    let conversations: Vec<(String, String)> = {
        let mut stmt = state.conn.prepare(&format!(
            "SELECT id, title FROM conversations WHERE {} \
             ORDER BY last_activity_at DESC, rowid DESC",
            comments::not_a_thread("id")
        ))?;
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<_, _>>()?
    };
    let mut material = String::new();
    for (id, title) in conversations {
        let mut block = format!("## {title}\n");
        for line in message_lines(&state, library, parse_id(&id, "ID")?)? {
            block.push_str(&line);
            block.push('\n');
        }
        if material.chars().count() + block.chars().count() + 1 > budget {
            continue;
        }
        material.push_str(&block);
        material.push('\n');
    }
    Ok(material.trim_end().to_string())
}

/// One Conversation's messages, oldest first, as "<speaker>: <text>". Over `budget` characters the
/// oldest are dropped, and a newest message longer than `budget` is cut to it.
pub fn conversation_material(
    project: &Project,
    library: &Library,
    conversation_id: Uuid,
    budget: usize,
) -> AppResult<String> {
    let lines = message_lines(&project.lock(), library, conversation_id)?;
    let mut kept = Vec::new();
    let mut used = 0;
    for line in lines.iter().rev() {
        used += line.chars().count() + 1;
        if used > budget {
            if kept.is_empty() {
                return Ok(line.chars().take(budget).collect());
            }
            break;
        }
        kept.push(line.as_str());
    }
    kept.reverse();
    Ok(kept.join("\n"))
}

/// Messages as "<speaker>: <text>", oldest first, the user as "You"; a message without text uses
/// its components' text.
fn message_lines(
    state: &ProjectState,
    library: &Library,
    conversation_id: Uuid,
) -> AppResult<Vec<String>> {
    let mut lines = Vec::new();
    for message in &state.conversation_messages(conversation_id)? {
        let speaker = match message.author.kind {
            AuthorKind::User => "You".to_string(),
            AuthorKind::System => continue,
            AuthorKind::MiniMe => Uuid::parse_str(&message.author.id)
                .ok()
                .and_then(|id| library.mini_me(id))
                .map_or("A Mini-Me".to_string(), |m| m.name.clone()),
        };
        let text = if message.content.trim().is_empty() {
            message.components.iter().map(|c| c.text.as_str()).collect::<Vec<_>>().join("\n")
        } else {
            message.content.clone()
        };
        if !text.trim().is_empty() {
            lines.push(format!("{speaker}: {}", text.trim()));
        }
    }
    Ok(lines)
}
