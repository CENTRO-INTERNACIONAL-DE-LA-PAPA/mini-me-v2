//! The earlier messages of a Conversation as a Trait sees them: who wrote each one, its text,
//! the names of its files, and whether it was finished, within a size budget. Also the
//! Conversation's results: the Assets and Interactive Components its messages hold.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use uuid::Uuid;

use crate::conversations;
use crate::library::Library;
use crate::protocol::{AssetRef, AuthorKind, Component, Message, MessageStatus, TextComponentKind};

/// The most `content` characters a history may hold.
pub const HISTORY_BUDGET_CHARS: usize = 50_000;

/// The most Assets, and the most components, that `results` lists.
pub const MAX_RESULTS: usize = 50;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Results {
    /// Newest first.
    pub assets: Vec<ResultAsset>,
    /// Newest first.
    pub components: Vec<ResultComponent>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResultAsset {
    #[serde(flatten)]
    pub asset: AssetRef,
    pub message_id: Uuid,
    /// Whether the Asset belongs to the call's own user message.
    pub current: bool,
    /// Whether the Asset is left out of what the user sees, such as a Trait's results file.
    pub hidden: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResultComponent {
    pub id: Uuid,
    pub kind: String,
    pub version: u32,
    pub message_id: Uuid,
    /// The name of the Mini-Me whose reply holds the component.
    pub author: String,
}

/// What a component's history line names besides its kind and ID.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ComponentLabel {
    pub title: Option<String>,
    /// The name of the component's source Asset.
    pub source: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct History {
    /// Oldest first.
    pub messages: Vec<HistoryEntry>,
    /// Whether older messages were left out to stay within the budget.
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HistoryEntry {
    /// `user` or `mini_me`.
    pub author: &'static str,
    pub name: String,
    pub content: String,
    pub files: Vec<String>,
    /// `false` for a reply that was stopped, failed or is still streaming.
    pub complete: bool,
}

/// The messages before `before` in `messages` (a Conversation in creation order), filled from the
/// newest back until the next would exceed `budget` characters. `system` notes are left out.
/// `labels` gives each component's title and source file for its line.
pub fn history(
    messages: &[Message],
    before: Uuid,
    (library, labels): (&Library, &HashMap<Uuid, ComponentLabel>),
    budget: usize,
) -> History {
    let earlier = messages
        .iter()
        .take_while(|m| m.id != before)
        .filter(|m| m.author.kind != AuthorKind::System);
    let mut kept: Vec<HistoryEntry> = Vec::new();
    let mut used = 0;
    let mut total = 0;
    for message in earlier.collect::<Vec<_>>().into_iter().rev() {
        total += 1;
        let entry = entry(message, library, labels);
        let size = entry.content.chars().count();
        if used + size > budget {
            break;
        }
        used += size;
        kept.push(entry);
    }
    let truncated = kept.len() < total;
    kept.reverse();
    History {
        messages: kept,
        truncated,
    }
}

/// Assets and components of `messages` (a Conversation in creation order) up to `reply`, newest
/// first, at most `MAX_RESULTS` of each, each Asset once. The Assets are the attached and
/// referenced files and the components' source files; those of `answers` and `reply` are
/// `current`. `find_asset` resolves an ID to its Asset and whether it is hidden.
pub fn results(
    messages: &[Message],
    answers: Uuid,
    reply: Uuid,
    library: &Library,
    find_asset: impl Fn(Uuid) -> Option<(AssetRef, bool)>,
) -> Results {
    let end = messages
        .iter()
        .position(|m| m.id == reply)
        .or_else(|| messages.iter().position(|m| m.id == answers))
        .map_or(messages.len(), |i| i + 1);
    let mut seen = HashSet::new();
    let mut assets = Vec::new();
    let mut components = Vec::new();
    for message in messages[..end].iter().rev() {
        if assets.len() >= MAX_RESULTS && components.len() >= MAX_RESULTS {
            break;
        }
        let current = message.id == answers || message.id == reply;
        let result = |(asset, hidden): (AssetRef, bool)| ResultAsset {
            asset,
            message_id: message.id,
            current,
            hidden,
        };
        for asset in &message.attachments {
            if assets.len() < MAX_RESULTS && seen.insert(asset.id) {
                assets.push(result((asset.clone(), false)));
            }
        }
        // Only files not listed yet are looked up, while there is room for them.
        let references = message
            .text_components
            .iter()
            .filter(|c| c.kind == TextComponentKind::Asset)
            .map(|c| c.id);
        let sources = message
            .components
            .iter()
            .rev()
            .filter_map(|c| c.source_asset_id);
        for id in references.chain(sources) {
            if assets.len() >= MAX_RESULTS {
                break;
            }
            if seen.contains(&id) {
                continue;
            }
            if let Some(found) = find_asset(id) {
                seen.insert(id);
                assets.push(result(found));
            }
        }
        let room = MAX_RESULTS.saturating_sub(components.len());
        if room > 0 && !message.components.is_empty() {
            let author = author_name(message, library);
            components.extend(message.components.iter().rev().take(room).map(|component| {
                ResultComponent {
                    id: component.id,
                    kind: component.kind.clone(),
                    version: component.version,
                    message_id: message.id,
                    author: author.clone(),
                }
            }));
        }
    }
    Results { assets, components }
}

/// A reply's Mini-Me name, or "Mini-Me" when the library no longer has it.
pub fn author_name(message: &Message, library: &Library) -> String {
    Uuid::parse_str(&message.author.id)
        .ok()
        .and_then(|id| library.mini_me(id))
        .map_or_else(|| "Mini-Me".to_string(), |m| m.name.clone())
}

fn entry(
    message: &Message,
    library: &Library,
    labels: &HashMap<Uuid, ComponentLabel>,
) -> HistoryEntry {
    let (author, name) = match message.author.kind {
        AuthorKind::User => ("user", "You".to_string()),
        _ => ("mini_me", author_name(message, library)),
    };
    HistoryEntry {
        author,
        name,
        content: content(message, labels),
        files: conversations::file_names(message),
        complete: message.status == MessageStatus::Complete,
    }
}

/// A message's text followed by one line per Interactive Component, so a follow-up can name a
/// component the model then reads by its ID.
fn content(message: &Message, labels: &HashMap<Uuid, ComponentLabel>) -> String {
    let lines = message
        .components
        .iter()
        .map(|c| component_line(c, labels.get(&c.id)));
    std::iter::once(message.content.clone())
        .chain(lines)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// `[<kind> "<title>" from <source>, id <id>]`, leaving out what the component lacks.
fn component_line(component: &Component, label: Option<&ComponentLabel>) -> String {
    let label = label.cloned().unwrap_or_default();
    let title = label.title.map(|t| format!(" \"{t}\"")).unwrap_or_default();
    let source = label
        .source
        .map(|s| format!(" from {s}"))
        .unwrap_or_default();
    format!("[{}{title}{source}, id {}]", component.kind, component.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{AssetRef, Author, Component, new_id};

    const SCRIBE: &str = "5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7b01";

    fn message(kind: AuthorKind, author_id: &str, content: &str, status: MessageStatus) -> Message {
        Message {
            id: new_id(),
            author: Author {
                kind,
                id: author_id.to_string(),
            },
            content: content.to_string(),
            status,
            reply_to: None,
            attachments: Vec::new(),
            text_components: Vec::new(),
            components: Vec::new(),
            steps: Vec::new(),
        }
    }

    fn user(content: &str) -> Message {
        message(AuthorKind::User, "u", content, MessageStatus::Complete)
    }

    fn scribe(content: &str, status: MessageStatus) -> Message {
        message(AuthorKind::MiniMe, SCRIBE, content, status)
    }

    #[test]
    fn earlier_messages_come_oldest_first_with_names_and_files() {
        let mut question = user("summarize #notes.txt");
        question.attachments.push(AssetRef {
            id: new_id(),
            name: "notes.txt".into(),
            media_type: "text/plain".into(),
            size_bytes: 3,
        });
        let summary = scribe("Late blight spreads fast.", MessageStatus::Complete);
        let note = message(
            AuthorKind::System,
            "routing",
            "Mention one with @",
            MessageStatus::Complete,
        );
        let stranger = message(
            AuthorKind::MiniMe,
            &new_id().to_string(),
            "Hi",
            MessageStatus::Complete,
        );
        let stopped = scribe("The main cause", MessageStatus::Cancelled);
        let current = user("make it shorter");
        let after = scribe("Shorter.", MessageStatus::Streaming);
        let all = [
            question,
            summary,
            note,
            stranger,
            stopped,
            current.clone(),
            after,
        ];

        let history = history(
            &all,
            current.id,
            (&Library::builtin(), &HashMap::new()),
            HISTORY_BUDGET_CHARS,
        );
        assert!(!history.truncated);
        let names: Vec<&str> = history.messages.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["You", "Scribe", "Mini-Me", "Scribe"]);
        assert_eq!(history.messages[0].files, ["notes.txt"]);
        assert_eq!(history.messages[0].author, "user");
        assert_eq!(history.messages[1].author, "mini_me");
        assert!(history.messages[1].complete);
        assert!(!history.messages[3].complete);
        assert_eq!(history.messages[3].content, "The main cause");

        let first = super::history(
            &all,
            all[0].id,
            (&Library::builtin(), &HashMap::new()),
            HISTORY_BUDGET_CHARS,
        );
        assert!(first.messages.is_empty() && !first.truncated);
    }

    #[test]
    fn a_reply_lists_each_component_as_a_line_within_the_budget() {
        let mut reply = scribe("Found 2 papers.", MessageStatus::Complete);
        let papers = component(&mut reply, "paper-sources");
        let approval = component(&mut reply, "approval");
        let all = [user("papers?"), reply, user("summarize the second paper")];
        let library = Library::builtin();
        let labels = HashMap::from([(
            papers,
            ComponentLabel {
                title: Some("Wild potato".into()),
                source: Some("papers.json".into()),
            },
        )]);

        let history = history(&all, all[2].id, (&library, &labels), HISTORY_BUDGET_CHARS);
        assert_eq!(
            history.messages[1].content,
            format!(
                "Found 2 papers.\n\n[paper-sources \"Wild potato\" from papers.json, id {papers}]\
                 \n\n[approval, id {approval}]"
            )
        );

        let only_text = "Found 2 papers.".chars().count();
        let tight = super::history(&all, all[2].id, (&library, &labels), only_text + 7);
        assert!(tight.messages.is_empty());
        assert!(tight.truncated);
    }

    #[test]
    fn the_budget_keeps_the_newest_messages() {
        let all = [user("aaaa"), user("bbbb"), user("cccc"), user("now")];
        let current = all[3].id;
        let library = Library::builtin();

        let fits = history(&all, current, (&library, &HashMap::new()), 8);
        let kept: Vec<&str> = fits.messages.iter().map(|e| e.content.as_str()).collect();
        assert_eq!(kept, ["bbbb", "cccc"]);
        assert!(fits.truncated);

        let exact = history(&all, current, (&library, &HashMap::new()), 12);
        assert_eq!(exact.messages.len(), 3);
        assert!(!exact.truncated);

        let too_big = history(&all, current, (&library, &HashMap::new()), 3);
        assert!(too_big.messages.is_empty());
        assert!(too_big.truncated);
    }

    fn asset(name: &str) -> AssetRef {
        AssetRef { id: new_id(), name: name.into(), media_type: "text/csv".into(), size_bytes: 1 }
    }

    fn component(reply: &mut Message, kind: &str) -> Uuid {
        component_from(reply, kind, None)
    }

    fn component_from(reply: &mut Message, kind: &str, source: Option<Uuid>) -> Uuid {
        let id = new_id();
        reply.components.push(Component {
            id,
            kind: kind.into(),
            version: 1,
            preview: serde_json::Value::Null,
            text: "a\tb".into(),
            source_asset_id: source,
            answer: serde_json::Value::Null,
            step_index: None,
        });
        id
    }

    #[test]
    fn results_are_newest_first_once_each_with_sources_and_the_current_files_marked() {
        let trial = asset("trial.csv");
        let profile = asset("trial-profile.csv");
        let mut first = user("profile #trial.csv");
        first.attachments.push(trial.clone());
        let mut reply = scribe("Done.", MessageStatus::Complete);
        let older = component_from(&mut reply, "table", Some(trial.id));
        let newer = component_from(&mut reply, "table", Some(profile.id));
        let notes = asset("notes.txt");
        let mut current = user("again #trial.csv and #notes.txt");
        for (id, label) in [(trial.id, "#trial.csv"), (notes.id, "#notes.txt")] {
            current
                .text_components
                .push(crate::protocol::TextComponent {
                    kind: TextComponentKind::Asset,
                    id,
                    label: label.into(),
                    start: 0,
                    end: 1,
                });
        }
        let current_id = current.id;
        let all = [first, reply, current];
        let registry = [
            (trial.clone(), false),
            (notes.clone(), false),
            (profile.clone(), true),
        ];
        let find = |id| registry.iter().find(|(a, _)| a.id == id).cloned();

        // The reply has not been created yet, so the results end at the user message.
        let results = results(&all, current_id, new_id(), &Library::builtin(), find);
        let names: Vec<(&str, bool, bool)> = results
            .assets
            .iter()
            .map(|a| (a.asset.name.as_str(), a.current, a.hidden))
            .collect();
        assert_eq!(
            names,
            [
                ("trial.csv", true, false),
                ("notes.txt", true, false),
                ("trial-profile.csv", false, true)
            ]
        );
        let ids: Vec<Uuid> = results.components.iter().map(|c| c.id).collect();
        assert_eq!(ids, [newer, older]);
        assert_eq!(results.components[0].author, "Scribe");
    }

    #[test]
    fn results_stop_at_the_reply_and_mark_its_own_files_current() {
        let question = user("profile it");
        let mut reply = scribe("Saved.", MessageStatus::Streaming);
        reply.attachments.push(asset("profile.csv"));
        let mut later = user("and this");
        later.attachments.push(asset("later.csv"));
        let (answers, reply_id) = (question.id, reply.id);
        let all = [question, reply, later];

        let results = results(&all, answers, reply_id, &Library::builtin(), |_| None);
        let names: Vec<(&str, bool)> =
            results.assets.iter().map(|a| (a.asset.name.as_str(), a.current)).collect();
        assert_eq!(names, [("profile.csv", true)]);
    }

    #[test]
    fn references_already_listed_are_not_looked_up() {
        let trial = asset("trial.csv");
        let mut question = user("again #trial.csv");
        question.attachments.push(trial.clone());
        question.text_components.push(crate::protocol::TextComponent {
            kind: TextComponentKind::Asset,
            id: trial.id,
            label: "#trial.csv".into(),
            start: 6,
            end: 16,
        });
        let answers = question.id;
        let lookups = std::cell::Cell::new(0);
        let find = |_| {
            lookups.set(lookups.get() + 1);
            None
        };
        let results = results(&[question], answers, new_id(), &Library::builtin(), find);
        assert_eq!(results.assets.len(), 1);
        assert_eq!(lookups.get(), 0);
    }
}
