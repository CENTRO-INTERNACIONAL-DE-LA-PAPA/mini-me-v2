//! The Project Overview: its header counts, the summary the user asked for, the featured
//! component, and every output the Project's Conversations produced. The summary and the
//! featured component live in the one-row `overview` table of `project.sqlite`.

use std::collections::HashMap;

use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::library::Library;
use crate::protocol::{AssetRef, Author, AuthorKind, Component};
use crate::store::{Project, ProjectState};

/// Component kinds that can be featured on the Overview.
const FEATURABLE: [&str; 2] = ["chart", "table"];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Overview {
    pub conversations: i64,
    /// The latest activity of any Conversation, in milliseconds; `None` without Conversations.
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

fn parse_id(value: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value).map_err(|_| AppError::storage("stored ID is not readable"))
}

fn author(kind: &str, id: String) -> AppResult<Author> {
    let kind =
        AuthorKind::parse(kind).ok_or_else(|| AppError::storage("stored author is not readable"))?;
    Ok(Author { kind, id })
}

/// The title an output card shows: a chart's or table's own title, a count of papers or
/// theories, or the first line of the component's text for other kinds.
fn component_title(kind: &str, title: Option<String>, count: Option<i64>, text: &str) -> String {
    match (kind, title, count) {
        ("chart" | "table", Some(title), _) if !title.trim().is_empty() => title,
        ("chart", _, _) => "Chart".into(),
        ("table", _, _) => "Table".into(),
        ("paper-sources", _, Some(1)) => "1 paper".into(),
        ("paper-sources", _, Some(n)) => format!("{n} papers"),
        ("theories", _, Some(1)) => "1 theory".into(),
        ("theories", _, Some(n)) => format!("{n} theories"),
        _ => text.lines().next().unwrap_or(kind).to_string(),
    }
}

pub fn overview(project: &Project) -> AppResult<Overview> {
    let state = project.lock();
    let conn = &state.conn;
    let (conversations, last_activity_at): (i64, Option<i64>) = conn.query_row(
        "SELECT COUNT(*), MAX(last_activity_at) FROM conversations",
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
        Some(id) => conn
            .query_row(
                "SELECT c.id, c.kind, c.version, c.data, c.text, c.answer, m.author_kind, \
                 m.author_id, m.conversation_id, m.id FROM components c \
                 JOIN messages m ON m.id = c.message_id WHERE c.id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, u32>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, String>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                },
            )
            .optional()?
            .map(|(id, kind, version, data, text, answer, a_kind, a_id, conversation, message)| {
                AppResult::Ok(Featured {
                    component: Component {
                        id: parse_id(&id)?,
                        kind,
                        version,
                        data: serde_json::from_str(&data)?,
                        text,
                        answer: answer
                            .map(|a| serde_json::from_str(&a))
                            .transpose()?
                            .unwrap_or_default(),
                        // The Overview draws the component on its own, outside its reply.
                        step_index: None,
                    },
                    author: author(&a_kind, a_id)?,
                    conversation_id: parse_id(&conversation)?,
                    message_id: parse_id(&message)?,
                })
            })
            .transpose()?,
    };

    let mut outputs = Vec::new();
    // Only the title and the list lengths are read from `data`, which can be large.
    let mut stmt = conn.prepare(
        "SELECT c.kind, c.id, json_extract(c.data, '$.title'), \
         COALESCE(json_array_length(c.data, '$.papers'), json_array_length(c.data, '$.theories')), \
         c.text, m.author_kind, m.author_id, m.conversation_id, v.title, m.id, c.created_at \
         FROM components c JOIN messages m ON m.id = c.message_id \
         JOIN conversations v ON v.id = m.conversation_id WHERE c.kind != 'approval'",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, i64>(10)?,
        ))
    })?;
    for row in rows {
        let (kind, id, title, count, text, a_kind, a_id, conversation, c_title, message, at) = row?;
        outputs.push(Output {
            title: component_title(&kind, title, count, &text),
            kind,
            id: parse_id(&id)?,
            author: author(&a_kind, a_id)?,
            conversation_id: parse_id(&conversation)?,
            conversation_title: c_title,
            message_id: parse_id(&message)?,
            created_at: at,
        });
    }

    // A file a Mini-Me saved belongs to the first message that attaches it.
    let generated: HashMap<Uuid, (String, i64)> = {
        let mut stmt =
            conn.prepare("SELECT id, name, created_at FROM assets WHERE source = 'generated'")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
        })?;
        let mut generated = HashMap::new();
        for row in rows {
            let (id, name, at) = row?;
            generated.insert(parse_id(&id)?, (name, at));
        }
        generated
    };
    if !generated.is_empty() {
        let mut stmt = conn.prepare(
            "SELECT m.id, m.author_kind, m.author_id, m.conversation_id, v.title, m.attachments \
             FROM messages m JOIN conversations v ON v.id = m.conversation_id \
             WHERE m.attachments != '[]' ORDER BY m.rowid",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })?;
        let mut seen = std::collections::HashSet::new();
        for row in rows {
            let (message, a_kind, a_id, conversation, c_title, attachments) = row?;
            let attached: Vec<AssetRef> = serde_json::from_str(&attachments)?;
            for asset in attached {
                let Some((name, at)) = generated.get(&asset.id) else { continue };
                if !seen.insert(asset.id) {
                    continue;
                }
                outputs.push(Output {
                    kind: "file".into(),
                    id: asset.id,
                    title: name.clone(),
                    author: author(&a_kind, a_id.clone())?,
                    conversation_id: parse_id(&conversation)?,
                    conversation_title: c_title.clone(),
                    message_id: parse_id(&message)?,
                    created_at: *at,
                });
            }
        }
    }
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

/// Features a chart or table on the Overview, replacing any other, or clears the featured
/// component with `None`.
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

/// Saves a summary the model wrote, with the time it was written in milliseconds.
pub fn save_summary(project: &Project, summary: &str, at: i64) -> AppResult<()> {
    project.lock().conn.execute(
        "UPDATE overview SET summary = ?1, summary_at = ?2 WHERE id = 1",
        params![summary, at],
    )?;
    Ok(())
}

/// The text a summary is written from: each Conversation's title and its messages as
/// `You:` or `<Mini-Me name>:` lines, newest Conversation first. Conversations are added whole
/// while the total stays within `budget` characters; the rest are left out. Messages without
/// text stand in with their components' text. File contents are never included.
pub fn summary_material(project: &Project, library: &Library, budget: usize) -> AppResult<String> {
    let state = project.lock();
    let conversations: Vec<(String, String)> = {
        let mut stmt =
            state.conn.prepare(
                "SELECT id, title FROM conversations ORDER BY last_activity_at DESC, rowid DESC",
            )?;
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<_, _>>()?
    };
    let mut material = String::new();
    for (id, title) in conversations {
        let mut block = format!("## {title}\n");
        for line in message_lines(&state, library, parse_id(&id)?)? {
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

/// The text a document is drafted from: one Conversation's messages, oldest first, each as
/// "<speaker>: <text>". When they exceed `budget` characters the oldest are left out.
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
            break;
        }
        kept.push(line.as_str());
    }
    kept.reverse();
    Ok(kept.join("\n"))
}

/// A Conversation's messages as "<speaker>: <text>" lines, oldest first: the user is "You", a
/// Mini-Me is its name, and a message with no text stands for its components' text.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets;
    use crate::conversations::{self, SendMessageInput};
    use crate::projects::test_support::temp_project;
    use crate::protocol::{EventKind, new_id};
    use serde_json::json;

    fn ask(project: &Project, conversation: Uuid, text: &str) -> Uuid {
        let input = SendMessageInput {
            content: text.into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        conversations::send_message(project, conversation, input, new_id()).unwrap().id
    }

    fn reply(project: &Project, conversation: Uuid, question: Uuid, mini_me: &str) -> Uuid {
        let author = Author { kind: AuthorKind::MiniMe, id: mini_me.into() };
        conversations::start_reply(project, conversation, question, author).unwrap()
    }

    fn add(
        project: &Project,
        conversation: Uuid,
        message: Uuid,
        kind: &str,
        data: serde_json::Value,
    ) -> Uuid {
        let component = Component {
            id: new_id(),
            kind: kind.into(),
            version: 1,
            data,
            text: format!("{kind} text"),
            answer: serde_json::Value::Null,
            step_index: None,
        };
        let id = component.id;
        let event = EventKind::ComponentAdded { message_id: message, component };
        project.lock().persist(conversation, event).unwrap();
        id
    }

    #[test]
    fn outputs_list_components_and_saved_files_newest_first() {
        let (dir, project) = temp_project();
        let first = conversations::create(&project).unwrap().id;
        let second = conversations::create(&project).unwrap().id;
        let question = ask(&project, first, "plot yield");
        let plotter = reply(&project, first, question, "plotter");
        let chart = add(&project, first, plotter, "chart", json!({ "title": "Yield" }));
        let table = add(&project, first, plotter, "table", json!({ "columns": [], "rows": [] }));
        add(&project, first, plotter, "approval", json!({ "step_id": "approve" }));
        let question = ask(&project, second, "find papers");
        let researcher = reply(&project, second, question, "researcher");
        let papers =
            add(&project, second, researcher, "paper-sources", json!({ "papers": [{}, {}] }));
        let source = dir.path().join("upload.csv");
        std::fs::write(&source, "a\n1\n").unwrap();
        assets::import(&project, &source).unwrap();
        let saved = assets::write_generated(&project, "clean.csv", "", b"a\n1\n").unwrap();
        let event = EventKind::AttachmentAdded { message_id: researcher, asset: saved.clone() };
        project.lock().persist(second, event).unwrap();

        let overview = overview(&project).unwrap();
        assert_eq!(overview.conversations, 2);
        assert!(overview.last_activity_at.is_some());
        let titles: Vec<(&str, &str)> =
            overview.outputs.iter().map(|o| (o.kind.as_str(), o.title.as_str())).collect();
        assert_eq!(titles.len(), 4, "no approval and no upload: {titles:?}");
        let expected = [
            ("chart", "Yield"),
            ("table", "Table"),
            ("paper-sources", "2 papers"),
            ("file", "clean.csv"),
        ];
        for expected in expected {
            assert!(titles.contains(&expected), "{expected:?} in {titles:?}");
        }
        let ids: Vec<Uuid> = overview.outputs.iter().map(|o| o.id).collect();
        assert!(ids.iter().position(|&i| i == papers) < ids.iter().position(|&i| i == chart));
        assert!(ids.contains(&table));
        let file = overview.outputs.iter().find(|o| o.id == saved.id).unwrap();
        assert_eq!((file.author.id.as_str(), file.message_id), ("researcher", researcher));
        assert!(overview.outputs.windows(2).all(|w| w[0].created_at >= w[1].created_at));
    }

    #[test]
    fn featuring_replaces_clears_and_refuses_other_kinds() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        let question = ask(&project, conversation, "plot yield");
        let message = reply(&project, conversation, question, "plotter");
        let chart_data = json!({ "title": "Yield", "views": [] });
        let chart = add(&project, conversation, message, "chart", chart_data);
        let table = add(&project, conversation, message, "table", json!({ "rows": [] }));
        let papers = add(&project, conversation, message, "paper-sources", json!({ "papers": [] }));

        feature(&project, Some(chart)).unwrap();
        let featured = overview(&project).unwrap().featured.unwrap();
        assert_eq!((featured.component.id, featured.message_id), (chart, message));
        assert_eq!(featured.component.data["title"], "Yield");
        feature(&project, Some(table)).unwrap();
        assert_eq!(overview(&project).unwrap().featured.unwrap().component.id, table);
        assert_eq!(feature(&project, Some(papers)).unwrap_err().code, "invalid_input");
        assert_eq!(overview(&project).unwrap().featured.unwrap().component.id, table);
        feature(&project, None).unwrap();
        assert!(overview(&project).unwrap().featured.is_none());
    }

    #[test]
    fn a_saved_summary_is_read_back_with_its_time() {
        let (_dir, project) = temp_project();
        assert_eq!(overview(&project).unwrap().summary, None);
        save_summary(&project, "Six candidate R-genes were found.", 42).unwrap();
        let overview = overview(&project).unwrap();
        assert_eq!(overview.summary.as_deref(), Some("Six candidate R-genes were found."));
        assert_eq!(overview.summary_at, Some(42));
    }

    #[test]
    fn material_names_speakers_and_leaves_out_whole_old_conversations() {
        let (_dir, project) = temp_project();
        let library = Library::builtin();
        let curator = library.summaries().into_iter().find(|m| m.name == "Curator").unwrap().id;
        let old = conversations::create(&project).unwrap().id;
        let question = ask(&project, old, "an old question about planting dates");
        reply(&project, old, question, &curator.to_string());
        let new = conversations::create(&project).unwrap().id;
        ask(&project, new, "clean the trial data");

        let material = summary_material(&project, &library, 100_000).unwrap();
        assert!(material.starts_with("## "), "{material}");
        assert!(material.contains("You: clean the trial data"));
        assert!(material.contains("You: an old question about planting dates"));
        let newest_first = material.find("clean the trial data") < material.find("planting dates");
        assert!(newest_first, "{material}");

        let small = summary_material(&project, &library, 60).unwrap();
        assert!(small.contains("clean the trial data") && !small.contains("planting"), "{small}");
    }
}
