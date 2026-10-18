//! The earlier messages of a Conversation as a Trait sees them: who wrote each one, its text,
//! the names of its files, and whether it was finished, within a size budget.

use serde::Serialize;
use uuid::Uuid;

use crate::conversations;
use crate::library::Library;
use crate::protocol::{AuthorKind, Message, MessageStatus};

/// The most `content` characters a history may hold.
pub const HISTORY_BUDGET_CHARS: usize = 50_000;

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

/// The messages before `before` in `messages` (a whole Conversation in creation order),
/// filled from the newest backwards until the next one would exceed `budget` characters.
/// Notes written by the app itself (`system` authors) are left out.
pub fn history(messages: &[Message], before: Uuid, library: &Library, budget: usize) -> History {
    let earlier = messages
        .iter()
        .take_while(|m| m.id != before)
        .filter(|m| m.author.kind != AuthorKind::System);
    let mut kept: Vec<HistoryEntry> = Vec::new();
    let mut used = 0;
    let mut total = 0;
    for message in earlier.collect::<Vec<_>>().into_iter().rev() {
        total += 1;
        let entry = entry(message, library);
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

fn entry(message: &Message, library: &Library) -> HistoryEntry {
    let (author, name) = match message.author.kind {
        AuthorKind::User => ("user", "You".to_string()),
        _ => {
            let name = Uuid::parse_str(&message.author.id)
                .ok()
                .and_then(|id| library.mini_me(id))
                .map_or_else(|| "Mini-Me".to_string(), |m| m.name.clone());
            ("mini_me", name)
        }
    };
    HistoryEntry {
        author,
        name,
        content: content(message),
        files: conversations::file_names(message),
        complete: message.status == MessageStatus::Complete,
    }
}

/// A message's text followed by the `text` of each of its Interactive Components, so a
/// follow-up can refer to what a component showed.
fn content(message: &Message) -> String {
    let parts = std::iter::once(message.content.as_str())
        .chain(message.components.iter().map(|c| c.text.as_str()))
        .filter(|part| !part.is_empty());
    parts.collect::<Vec<_>>().join("\n\n")
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

        let history = history(&all, current.id, &Library::builtin(), HISTORY_BUDGET_CHARS);
        assert!(!history.truncated);
        let names: Vec<&str> = history.messages.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["You", "Scribe", "Mini-Me", "Scribe"]);
        assert_eq!(history.messages[0].files, ["notes.txt"]);
        assert_eq!(history.messages[0].author, "user");
        assert_eq!(history.messages[1].author, "mini_me");
        assert!(history.messages[1].complete);
        assert!(!history.messages[3].complete);
        assert_eq!(history.messages[3].content, "The main cause");
    }

    #[test]
    fn a_reply_includes_the_text_of_its_components_within_the_budget() {
        let mut reply = scribe("Found 2 papers.", MessageStatus::Complete);
        reply.components.push(Component {
            id: new_id(),
            kind: "paper-sources".into(),
            version: 1,
            data: serde_json::json!({ "papers": [] }),
            text: "1. Late blight\n2. Wild potato".into(),
            answer: serde_json::Value::Null,
        });
        let all = [user("papers?"), reply, user("summarize the second paper")];
        let library = Library::builtin();

        let history = history(&all, all[2].id, &library, HISTORY_BUDGET_CHARS);
        assert_eq!(
            history.messages[1].content,
            "Found 2 papers.\n\n1. Late blight\n2. Wild potato"
        );

        let only_text = "Found 2 papers.".chars().count();
        let tight = super::history(&all, all[2].id, &library, only_text + 7);
        assert!(tight.messages.is_empty());
        assert!(tight.truncated);
    }

    #[test]
    fn the_budget_keeps_the_newest_messages() {
        let all = [user("aaaa"), user("bbbb"), user("cccc"), user("now")];
        let current = all[3].id;
        let library = Library::builtin();

        let fits = history(&all, current, &library, 8);
        let kept: Vec<&str> = fits.messages.iter().map(|e| e.content.as_str()).collect();
        assert_eq!(kept, ["bbbb", "cccc"]);
        assert!(fits.truncated);

        let exact = history(&all, current, &library, 12);
        assert_eq!(exact.messages.len(), 3);
        assert!(!exact.truncated);

        let too_big = history(&all, current, &library, 3);
        assert!(too_big.messages.is_empty());
        assert!(too_big.truncated);
    }

    #[test]
    fn the_first_message_has_no_history() {
        let all = [user("hello")];
        let history = history(&all, all[0].id, &Library::builtin(), HISTORY_BUDGET_CHARS);
        assert_eq!(history.messages, Vec::new());
        assert!(!history.truncated);
    }
}
