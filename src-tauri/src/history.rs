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
