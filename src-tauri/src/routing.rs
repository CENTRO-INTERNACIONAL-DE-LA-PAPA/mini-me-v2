//! Which Mini-Me answers a user message, whether it also reacts to it, whether the message
//! needs earlier context, and which of the Conversation's files it means when it tags none, as
//! decided by Typesafe's Jev. When Jev is unsure or cannot be asked, the fallback Mini-Me
//! answers.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use uuid::Uuid;

use crate::assets;
use crate::comments;
use crate::conversations::{self, SendMessageInput};
use crate::error::{AppError, AppResult};
use crate::history::{author_name, results};
use crate::library::{FALLBACK_MINI_ME, Library};
use crate::user_library::LibraryStore;
use crate::link::{CallModel, RouteFile, RouteMiniMe, RunFile};
use crate::protocol::{Author, AuthorKind, ErrorInfo, Message, TextComponentKind};
use crate::runs::{RouteAnswers, RunSpec, Runs};
use crate::store::Project;

/// How long a message waits for Jev before the fallback Mini-Me answers it.
pub const ROUTE_TIMEOUT: Duration = Duration::from_secs(10);

/// The reactions Jev may choose besides `none`.
const REACTIONS: [&str; 16] = [
    "👍", "🎉", "💛", "😄", "😡", "😢", "🥔", "🤔", "😮", "💪", "🌱", "😅", "🙏", "☕", "🧪", "🌧️",
];

/// The share of Jev's confident reactions that are added, so that a Conversation about one
/// topic does not get the same reaction on every message.
pub const REACTION_CHANCE: f64 = 0.5;

/// How many earlier messages Jev sees, and how many characters of each.
const RECENT_TURNS: usize = 4;
const RECENT_CHARS: usize = 200;

/// What a routing decision depends on besides the message.
#[derive(Debug, Clone)]
pub struct RouteSettings {
    pub model: Option<CallModel>,
    pub threshold: f64,
    pub timeout: Duration,
    /// Store Jev's raw answers with the message (a developer setting).
    pub show_answers: bool,
    /// The share of confident reactions that are added, from 0 to 1.
    pub reaction_chance: f64,
}

/// The author ID of the notes that say why a message got no reply.
const ROUTING_AUTHOR: &str = "routing";

#[derive(Debug, Clone, PartialEq)]
struct Decision {
    /// The Mini-Me that answers.
    answerer: Uuid,
    reaction: Option<String>,
    needs_context: Option<bool>,
    /// The Conversation's file the message means, when it tags none.
    file: Option<RunFile>,
}

/// The warnings shown while Jev cannot choose, so the fallback Mini-Me answers every message
/// without a mention.
const NO_KEY: &str = "Mini-Mes aren't chosen automatically: there is no Typesafe key. Add one \
    in Settings → Accounts.";
const NOT_ANSWERING: &str = "Mini-Mes aren't chosen automatically: Typesafe isn't answering. \
    Assistant answers until it does.";

type WarningSink = Box<dyn Fn(Option<&str>) -> bool + Send>;

pub struct Routing {
    library: Arc<LibraryStore>,
    /// Conversations whose latest message is waiting for a routing decision.
    pending: Mutex<HashSet<Uuid>>,
    /// Why Jev cannot choose right now, if it cannot.
    warning: Mutex<Option<&'static str>>,
    subscribers: Mutex<Vec<WarningSink>>,
}

impl Routing {
    /// `has_key` is whether a Typesafe key is saved.
    pub fn new(library: Arc<LibraryStore>, has_key: bool) -> Arc<Self> {
        Arc::new(Self {
            library,
            pending: Mutex::new(HashSet::new()),
            warning: Mutex::new((!has_key).then_some(NO_KEY)),
            subscribers: Mutex::new(Vec::new()),
        })
    }

    /// Sends the current warning to `sink` and then every change. `sink` returns `false`
    /// when it is gone.
    pub fn subscribe(&self, sink: WarningSink) {
        let warning = self.warning.lock().unwrap_or_else(|p| p.into_inner());
        if sink(*warning) {
            self.subscribers
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .push(sink);
        }
    }

    /// Clears the warning when a Typesafe key is saved, which the next route confirms, and
    /// warns when it is removed.
    pub fn key_saved(&self, saved: bool) {
        self.warn(if saved { None } else { Some(NO_KEY) });
    }

    fn warn(&self, next: Option<&'static str>) {
        let mut warning = self.warning.lock().unwrap_or_else(|p| p.into_inner());
        if *warning == next {
            return;
        }
        *warning = next;
        self.subscribers
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .retain(|sink| sink(next));
    }

    /// Validates and persists a user message, then decides on a background thread who
    /// answers it. Fails with `reply_in_progress` while an earlier message of the
    /// Conversation is still waiting for its decision. In a comment thread, Jev is not asked:
    /// the first Mini-Me the comment mentions answers, and a comment without one is a note.
    pub fn send(
        self: &Arc<Self>,
        calls: Arc<Runs>,
        settings: RouteSettings,
        project: Arc<Project>,
        conversation_id: Uuid,
        input: SendMessageInput,
        user_id: Uuid,
    ) -> AppResult<Message> {
        check_mentions(&input, &self.library.current())?;
        if comments::is_thread(&project.lock(), conversation_id)? {
            let message = conversations::send_message(&project, conversation_id, input, user_id)?;
            if let Some(mini_me) = first_mention(&message) {
                let library = self.library.current();
                let started = self.start_reply(
                    &library,
                    &calls,
                    settings.model,
                    &project,
                    conversation_id,
                    &message,
                    mini_me,
                    Some(true),
                    None,
                );
                if let Err(err) = started {
                    explain(&project, conversation_id, message.id, &err);
                }
            }
            return Ok(message);
        }
        let message = {
            let mut pending = self.pending.lock().unwrap_or_else(|p| p.into_inner());
            if pending.contains(&conversation_id) {
                return Err(AppError::new(
                    "reply_in_progress",
                    "Wait until Mini-Me has chosen who answers your last message.",
                ));
            }
            let message = conversations::send_message(&project, conversation_id, input, user_id)?;
            pending.insert(conversation_id);
            message
        };
        let this = Arc::clone(self);
        let sent = message.clone();
        std::thread::spawn(move || {
            this.route(&calls, &settings, &project, conversation_id, &sent);
            this.pending
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .remove(&conversation_id);
        });
        Ok(message)
    }

    /// Asks Jev and starts the reply, or notes why no reply could be started.
    fn route(
        &self,
        calls: &Runs,
        settings: &RouteSettings,
        project: &Arc<Project>,
        conversation_id: Uuid,
        message: &Message,
    ) {
        let library = self.library.current();
        let mentioned = first_mention(message);
        let mut ask = vec!["reaction".to_string(), "needs_context".to_string()];
        if mentioned.is_none() {
            ask.insert(0, "mini_me".to_string());
        }
        let mini_mes = library
            .summaries()
            .into_iter()
            .map(|m| RouteMiniMe {
                id: m.id,
                name: m.name,
                description: m.description,
            })
            .collect();
        let messages = project.lock().conversation_messages(conversation_id).unwrap_or_default();
        let files = file_options(project, &messages, message, &library);
        if !files.is_empty() {
            ask.push("file".to_string());
        }
        let recent = recent(&messages, message.id, &library);
        let state = state(message, recent);
        let routed = calls.route(state, mini_mes, files.clone(), ask, settings.timeout);
        if settings.show_answers {
            let (answers, error) = match &routed {
                Ok(answers) => (json!(answers), None),
                Err(err) => (
                    Value::Null,
                    Some(ErrorInfo {
                        code: err.code.clone(),
                        message: err.message.clone(),
                    }),
                ),
            };
            if let Err(err) = conversations::record_jev_answers(
                project,
                conversation_id,
                message.id,
                answers,
                error,
            ) {
                eprintln!("could not store Jev's answers: {err}");
            }
        }
        if let Some(warning) = warning_after(&routed) {
            self.warn(warning);
        }
        let answers = match routed {
            Ok(answers) => Some(answers),
            Err(err) => {
                eprintln!("no routing decision: {err}");
                None
            }
        };
        let reacts = draw() < settings.reaction_chance;
        let decision = decide(
            answers.as_ref(),
            mentioned,
            &files,
            settings.threshold,
            reacts,
            &library,
        );
        let started = self.start_reply(
            &library,
            calls,
            settings.model.clone(),
            project,
            conversation_id,
            message,
            decision.answerer,
            decision.needs_context,
            decision.file,
        );
        match started {
            Ok(author) => {
                if let Some(emoji) = decision.reaction {
                    if let Err(err) =
                        conversations::add_reaction(project, message.id, &emoji, author)
                    {
                        eprintln!("could not add the reaction: {err}");
                    }
                }
            }
            Err(err) => explain(project, conversation_id, message.id, &err),
        }
    }

    /// Starts `mini_me_id`'s reply to `message`, with `file` as its picked file; returns the
    /// reply's author.
    fn start_reply(
        &self,
        library: &Library,
        calls: &Runs,
        model: Option<CallModel>,
        project: &Arc<Project>,
        conversation_id: Uuid,
        message: &Message,
        mini_me_id: Uuid,
        needs_context: Option<bool>,
        file: Option<RunFile>,
    ) -> AppResult<Author> {
        let author = Author {
            kind: AuthorKind::MiniMe,
            id: mini_me_id.to_string(),
        };
        let input = json!({ "text": input_text(message) });
        let mut spec =
            RunSpec::for_mini_me(library, mini_me_id, author.clone(), input, needs_context)?;
        spec.file = file;
        calls.start(Arc::clone(project), conversation_id, message, spec, model)?;
        Ok(author)
    }
}

/// Notes under the message `message_id` why no reply could start.
fn explain(project: &Project, conversation_id: Uuid, message_id: Uuid, err: &AppError) {
    eprintln!("could not start a reply: {err}");
    let content = format!("Couldn't start a reply: {}", err.message);
    let noted =
        conversations::system_reply(project, conversation_id, message_id, ROUTING_AUTHOR, &content);
    if let Err(err) = noted {
        eprintln!("could not say why there is no reply: {err}");
    }
}

/// Rejects a message that mentions a Mini-Me the library does not have.
fn check_mentions(input: &SendMessageInput, library: &Library) -> AppResult<()> {
    let unknown = input
        .text_components
        .iter()
        .any(|c| c.kind == TextComponentKind::MiniMe && library.mini_me(c.id).is_none());
    if unknown {
        return Err(AppError::invalid_input("That Mini-Me does not exist."));
    }
    Ok(())
}

fn first_mention(message: &Message) -> Option<Uuid> {
    message
        .text_components
        .iter()
        .filter(|c| c.kind == TextComponentKind::MiniMe)
        .min_by_key(|c| c.start)
        .map(|c| c.id)
}

/// What Jev sees of a message: its text without mentions, the names of its files, and the
/// recent turns before it. File contents stay on the user's computer.
fn state(message: &Message, recent: Value) -> Value {
    json!({
        "message": input_text(message),
        "files": conversations::file_names(message),
        "recent": recent,
    })
}

/// The last `RECENT_TURNS` messages before `before` in `messages` (a whole Conversation in
/// creation order), oldest first, each as its author's name, the start of its text and its
/// file names. Interactive Components are left out, since their text can hold table data.
fn recent(messages: &[Message], before: Uuid, library: &Library) -> Value {
    let earlier: Vec<&Message> = messages
        .iter()
        .take_while(|m| m.id != before)
        .filter(|m| m.author.kind != AuthorKind::System)
        .collect();
    let start = earlier.len().saturating_sub(RECENT_TURNS);
    let turns: Vec<Value> = earlier[start..]
        .iter()
        .map(|m| {
            let name = match m.author.kind {
                AuthorKind::User => "You".to_string(),
                _ => author_name(m, library),
            };
            json!({
                "name": name,
                "content": m.content.chars().take(RECENT_CHARS).collect::<String>(),
                "files": conversations::file_names(m),
            })
        })
        .collect();
    json!(turns)
}

/// The warning a route's outcome calls for, or `None` to keep the current one. A stopped
/// runtime keeps it, since the sidecar's own status explains that.
fn warning_after(routed: &AppResult<RouteAnswers>) -> Option<Option<&'static str>> {
    match routed {
        Ok(_) => Some(None),
        Err(err) if err.code == "sidecar_stopped" => None,
        Err(err) if err.code == "secret_unavailable" => Some(Some(NO_KEY)),
        Err(_) => Some(Some(NOT_ANSWERING)),
    }
}

/// The options of Jev's `file` question: the Conversation's Assets, newest first, or none
/// when `message` references or attaches a file of its own, which always wins.
fn file_options(
    project: &Project,
    messages: &[Message],
    message: &Message,
    library: &Library,
) -> Vec<RouteFile> {
    if !conversations::file_names(message).is_empty() {
        return Vec::new();
    }
    let state = project.lock();
    let found = results(messages, message.id, message.id, library, |id| {
        assets::find(&state, id).ok()
    });
    found
        .assets
        .into_iter()
        .map(|a| RouteFile {
            id: a.asset.id,
            name: a.asset.name,
        })
        .collect()
}

/// A random number from 0 up to 1, taken from the random bits of a new UUIDv7.
fn draw() -> f64 {
    let (_, random) = Uuid::now_v7().as_u64_pair();
    (random & ((1 << 53) - 1)) as f64 / (1u64 << 53) as f64
}

/// Turns Jev's answers (`None` when Jev could not be asked) into who answers, the reaction,
/// the context answer and the picked file, one of `files`. A confidence equal to the
/// threshold passes; below it, or without an answer, the fallback Mini-Me answers and no file
/// is picked. A confident reaction is kept only when `reacts`.
fn decide(
    answers: Option<&RouteAnswers>,
    mentioned: Option<Uuid>,
    files: &[RouteFile],
    threshold: f64,
    reacts: bool,
    library: &Library,
) -> Decision {
    let answer = |question: &str| answers.and_then(|a| a.get(question));

    let chosen = answer("mini_me")
        .filter(|choice| choice.confidence >= threshold)
        .and_then(|choice| Uuid::parse_str(&choice.choice).ok())
        .filter(|id| library.mini_me(*id).is_some());
    let answerer = mentioned.or(chosen).unwrap_or(FALLBACK_MINI_ME);

    let reaction = answer("reaction")
        .filter(|r| r.confidence >= threshold && REACTIONS.contains(&r.choice.as_str()))
        .filter(|_| reacts)
        .map(|r| r.choice.clone());
    let needs_context = answer("needs_context").and_then(|c| match c.choice.as_str() {
        "yes" => Some(true),
        "no" => Some(false),
        _ => None,
    });
    let file = answer("file")
        .filter(|f| f.confidence >= threshold)
        .and_then(|f| files.iter().find(|o| o.id.to_string() == f.choice))
        .map(|o| RunFile {
            asset_id: o.id,
            name: o.name.clone(),
        });
    Decision {
        answerer,
        reaction,
        needs_context,
        file,
    }
}

/// The message content without its Mini-Me mentions, trimmed. A mention between two spaces
/// takes one of them along, so no double space is left behind. Offsets are UTF-16 code
/// units, as in `TextComponent`.
fn input_text(message: &Message) -> String {
    let units: Vec<u16> = message.content.encode_utf16().collect();
    let mut mentions: Vec<(usize, usize)> = message
        .text_components
        .iter()
        .filter(|c| c.kind == TextComponentKind::MiniMe)
        .map(|c| (c.start as usize, (c.end as usize).min(units.len())))
        .collect();
    mentions.sort();
    let space = u16::from(b' ');
    let mut kept: Vec<u16> = Vec::with_capacity(units.len());
    let mut at = 0;
    for (start, end) in mentions {
        if start < at {
            continue;
        }
        kept.extend_from_slice(&units[at..start]);
        at = end;
        if kept.last().is_none_or(|&u| u == space) && units.get(at) == Some(&space) {
            at += 1;
        }
    }
    kept.extend_from_slice(&units[at.min(units.len())..]);
    String::from_utf16_lossy(&kept).trim().to_string()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::time::Instant;

    use super::*;
    use crate::comments::test_support::into_thread;
    use crate::link::{AdapterInfo, ChoiceAnswer, CoreFrame};
    use crate::protocol::{AssetRef, EventKind, MessageStatus, TextComponent, new_id};
    use crate::secrets::NoSecrets;
    use crate::sidecar::SidecarLog;
    use crate::runs::FrameSink;

    const SCRIBE: Uuid = uuid::uuid!("5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7b01");
    const ASSISTANT: Uuid = uuid::uuid!("5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7b03");

    /// A message whose `@Name` mentions are found in `content` in order of `mentions`.
    fn message(content: &str, mentions: &[(&str, Uuid)]) -> Message {
        let units: Vec<u16> = content.encode_utf16().collect();
        let text_components = mentions
            .iter()
            .map(|(label, id)| {
                let needle: Vec<u16> = label.encode_utf16().collect();
                let start = units
                    .windows(needle.len())
                    .position(|w| w == needle.as_slice())
                    .unwrap();
                TextComponent {
                    kind: TextComponentKind::MiniMe,
                    id: *id,
                    label: label.to_string(),
                    start: start as u32,
                    end: (start + needle.len()) as u32,
                }
            })
            .collect();
        Message {
            id: new_id(),
            author: Author {
                kind: AuthorKind::User,
                id: "user".into(),
            },
            content: content.to_string(),
            status: MessageStatus::Complete,
            reply_to: None,
            attachments: Vec::new(),
            text_components,
            components: Vec::new(),
            steps: Vec::new(),
        }
    }

    fn answer(choice: &str, confidence: f64, probabilities: &[(&str, f64)]) -> ChoiceAnswer {
        ChoiceAnswer {
            choice: choice.to_string(),
            confidence,
            probabilities: probabilities
                .iter()
                .map(|(k, p)| (k.to_string(), *p))
                .collect(),
        }
    }

    fn answers(entries: Vec<(&str, ChoiceAnswer)>) -> RouteAnswers {
        entries
            .into_iter()
            .map(|(k, a)| (k.to_string(), a))
            .collect::<BTreeMap<_, _>>()
    }

    #[test]
    fn jev_picks_the_mini_me_at_or_above_the_threshold() {
        let library = Library::builtin();
        let scribe = SCRIBE.to_string();
        let sure = answers(vec![("mini_me", answer(&scribe, 0.5, &[]))]);
        assert_eq!(
            decide(Some(&sure), None, &[], 0.5, true, &library).answerer,
            SCRIBE
        );
    }

    #[test]
    fn low_confidence_or_an_unknown_mini_me_falls_back() {
        let library = Library::builtin();
        let unsure = answers(vec![("mini_me", answer(&SCRIBE.to_string(), 0.3, &[]))]);
        assert_eq!(
            decide(Some(&unsure), None, &[], 0.5, true, &library).answerer,
            FALLBACK_MINI_ME
        );
        let unknown = answers(vec![("mini_me", answer(&new_id().to_string(), 0.99, &[]))]);
        assert_eq!(
            decide(Some(&unknown), None, &[], 0.5, true, &library).answerer,
            FALLBACK_MINI_ME
        );
    }

    #[test]
    fn without_jev_a_mentioned_mini_me_answers_or_else_the_fallback() {
        let library = Library::builtin();
        assert_eq!(
            decide(None, None, &[], 0.5, true, &library),
            Decision {
                answerer: FALLBACK_MINI_ME,
                reaction: None,
                needs_context: None,
                file: None,
            }
        );
        assert_eq!(
            decide(None, Some(SCRIBE), &[], 0.5, true, &library),
            Decision {
                answerer: SCRIBE,
                reaction: None,
                needs_context: None,
                file: None,
            }
        );
    }

    #[test]
    fn the_fallback_reacts_under_the_same_threshold() {
        let library = Library::builtin();
        let unsure = answers(vec![
            ("mini_me", answer(&SCRIBE.to_string(), 0.3, &[])),
            ("reaction", answer("👍", 0.8, &[])),
        ]);
        let decision = decide(Some(&unsure), None, &[], 0.5, true, &library);
        assert_eq!(decision.answerer, FALLBACK_MINI_ME);
        assert_eq!(decision.reaction.as_deref(), Some("👍"));
    }

    #[test]
    fn reactions_and_context_follow_jevs_answers() {
        let library = Library::builtin();
        let confident = answers(vec![
            ("reaction", answer("👍", 0.8, &[])),
            ("needs_context", answer("yes", 0.6, &[])),
        ]);
        let decision = decide(Some(&confident), Some(SCRIBE), &[], 0.5, true, &library);
        assert_eq!(decision.reaction.as_deref(), Some("👍"));
        assert_eq!(decision.needs_context, Some(true));

        let unsure = answers(vec![
            ("reaction", answer("🎉", 0.4, &[])),
            ("needs_context", answer("no", 0.9, &[])),
        ]);
        let decision = decide(Some(&unsure), Some(SCRIBE), &[], 0.5, true, &library);
        assert_eq!(decision.reaction, None);
        assert_eq!(decision.needs_context, Some(false));

        let none = answers(vec![("reaction", answer("none", 0.99, &[]))]);
        assert_eq!(
            decide(Some(&none), Some(SCRIBE), &[], 0.5, true, &library).reaction,
            None
        );
    }

    #[test]
    fn jev_picks_one_of_the_offered_files_at_or_above_the_threshold() {
        let library = Library::builtin();
        let cleaned = RouteFile { id: new_id(), name: "field-trial-cleaned.csv".into() };
        let files = [cleaned.clone()];
        let pick = |choice: &str, confidence: f64| {
            let answers = answers(vec![("file", answer(choice, confidence, &[]))]);
            decide(Some(&answers), None, &files, 0.5, true, &library).file
        };
        let picked = RunFile { asset_id: cleaned.id, name: cleaned.name.clone() };
        assert_eq!(pick(&cleaned.id.to_string(), 0.5), Some(picked));
        assert_eq!(pick(&cleaned.id.to_string(), 0.4), None);
        assert_eq!(pick("none", 0.9), None);
        assert_eq!(pick(&new_id().to_string(), 0.9), None);
    }

    #[test]
    fn a_confident_reaction_is_kept_only_when_the_draw_passes() {
        let library = Library::builtin();
        let potato = answers(vec![("reaction", answer("🥔", 0.9, &[]))]);
        let reaction = |reacts| decide(Some(&potato), Some(SCRIBE), &[], 0.5, reacts, &library);
        assert_eq!(reaction(true).reaction.as_deref(), Some("🥔"));
        assert_eq!(reaction(false).reaction, None);
    }

    #[test]
    fn mentions_are_removed_from_the_input() {
        let assistant = |content: &str| input_text(&message(content, &[("@Assistant", ASSISTANT)]));
        assert_eq!(assistant("@Assistant late blight"), "late blight");
        assert_eq!(assistant("hi @Assistant there"), "hi there");
        assert_eq!(assistant("papa 🥔 @Assistant ñame"), "papa 🥔 ñame");
        let both = message(
            "@Assistant and @Scribe, hello",
            &[("@Assistant", ASSISTANT), ("@Scribe", SCRIBE)],
        );
        assert_eq!(input_text(&both), "and , hello");
        assert_eq!(first_mention(&both), Some(ASSISTANT));
    }

    #[test]
    fn jev_gets_the_text_and_file_names_only() {
        let mut sent = message(
            "@Assistant summarize #notes.txt",
            &[("@Assistant", ASSISTANT)],
        );
        sent.text_components.push(TextComponent {
            kind: TextComponentKind::Asset,
            id: new_id(),
            label: "#notes.txt".into(),
            start: 21,
            end: 31,
        });
        assert_eq!(
            state(&sent, json!([])),
            json!({ "message": "summarize #notes.txt", "files": ["notes.txt"], "recent": [] })
        );
    }

    #[test]
    fn jev_sees_the_last_turns_by_name_and_shortened() {
        let by = |kind: AuthorKind, id: &str, content: &str| {
            let mut m = message(content, &[]);
            m.author = Author { kind, id: id.into() };
            m
        };
        let scribe = SCRIBE.to_string();
        let messages = [
            by(AuthorKind::User, "user", "hello"),
            by(AuthorKind::User, "user", "first question"),
            by(AuthorKind::MiniMe, &scribe, "first answer"),
            by(AuthorKind::User, "user", "clean the table"),
            by(AuthorKind::System, ROUTING_AUTHOR, "Couldn't start a reply"),
            by(AuthorKind::MiniMe, &scribe, &"é".repeat(RECENT_CHARS + 50)),
            by(AuthorKind::User, "user", "now remove the empty rows"),
        ];
        let turns = recent(&messages, messages[6].id, &Library::builtin());
        let turns = turns.as_array().unwrap();
        let names: Vec<&str> = turns.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["You", "Scribe", "You", "Scribe"]);
        assert_eq!(turns[0]["content"], "first question");
        assert_eq!(turns[3]["content"].as_str().unwrap().chars().count(), RECENT_CHARS);
    }

    #[test]
    fn a_warning_shows_until_routing_works_again() {
        let routing = Routing::new(LibraryStore::builtin(), false);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);
        routing.subscribe(Box::new(move |w| {
            log.lock().unwrap().push(w.map(str::to_string));
            true
        }));
        let failed = |code: &str| Err(AppError::new(code, ""));
        for routed in [failed("jev_timeout"), failed("sidecar_stopped"), Ok(RouteAnswers::new())] {
            if let Some(warning) = warning_after(&routed) {
                routing.warn(warning);
            }
        }
        routing.key_saved(false);
        let expected = [Some(NO_KEY), Some(NOT_ANSWERING), None, Some(NO_KEY)];
        assert_eq!(*seen.lock().unwrap(), expected.map(|w| w.map(str::to_string)));
    }

    #[test]
    fn unknown_mentions_are_rejected() {
        let library = Library::builtin();
        let mut input = SendMessageInput {
            content: "@Ghost hi".into(),
            attachments: Vec::new(),
            text_components: message("@Ghost hi", &[("@Ghost", new_id())]).text_components,
        };
        assert_eq!(
            check_mentions(&input, &library).unwrap_err().code,
            "invalid_input"
        );
        input.text_components[0].id = SCRIBE;
        assert!(check_mentions(&input, &library).is_ok());
    }

    #[derive(Default)]
    struct Recorder(Mutex<Vec<CoreFrame>>);

    impl FrameSink for Recorder {
        fn send(&self, frame: &CoreFrame) -> bool {
            self.0.lock().unwrap().push(frame.clone());
            true
        }
    }

    struct Fixture {
        _dir: tempfile::TempDir,
        project: Arc<Project>,
        conversation: Uuid,
        calls: Arc<Runs>,
        sink: Arc<Recorder>,
        routing: Arc<Routing>,
    }

    fn fixture() -> Fixture {
        fixture_with(LibraryStore::builtin())
    }

    fn fixture_with(library: Arc<LibraryStore>) -> Fixture {
        let (dir, project) = crate::projects::test_support::temp_project();
        let project = Arc::new(project);
        let conversation = conversations::create(&project).unwrap().id;
        let calls = Arc::new(Runs::new(
            Box::new(NoSecrets),
            Arc::new(SidecarLog::disabled()),
            crate::runs::CANCEL_TIMEOUT,
            Arc::clone(&library),
        ));
        let sink = Arc::new(Recorder::default());
        let adapter = |id: &str| AdapterInfo {
            id: id.into(),
            description: String::new(),
            input_schema: json!({}),
            providers: vec!["dummy".into()],
        };
        calls.connect(
            Arc::clone(&sink) as Arc<dyn FrameSink>,
            vec![adapter("prompt"), adapter("assist")],
        );
        Fixture {
            _dir: dir,
            project,
            conversation,
            calls,
            sink,
            routing: Routing::new(library, true),
        }
    }

    impl Fixture {
        fn send(
            &self,
            content: &str,
            mentions: &[(&str, Uuid)],
            timeout: Duration,
        ) -> AppResult<Message> {
            let input = SendMessageInput {
                content: content.into(),
                attachments: Vec::new(),
                text_components: message(content, mentions).text_components,
            };
            let settings = RouteSettings {
                model: Some(CallModel {
                    provider: "dummy".into(),
                    model: "dummy-model".into(),
                }),
                threshold: 0.5,
                timeout,
                show_answers: false,
                reaction_chance: 1.0,
            };
            self.routing.send(
                Arc::clone(&self.calls),
                settings,
                Arc::clone(&self.project),
                self.conversation,
                input,
                new_id(),
            )
        }

        fn events(&self) -> Vec<EventKind> {
            let events = self
                .project
                .lock()
                .events_after(self.conversation, 0)
                .unwrap();
            events.into_iter().map(|e| e.kind).collect()
        }

        fn wait_for(&self, what: &str, found: impl Fn(&[EventKind]) -> bool) -> Vec<EventKind> {
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                let events = self.events();
                if found(&events) {
                    return events;
                }
                assert!(Instant::now() < deadline, "timed out waiting for {what}");
                std::thread::sleep(Duration::from_millis(10));
            }
        }

        fn route_id(&self) -> Uuid {
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                let found = self
                    .sink
                    .0
                    .lock()
                    .unwrap()
                    .iter()
                    .find_map(|frame| match frame {
                        CoreFrame::RouteStart { route_id, .. } => Some(*route_id),
                        _ => None,
                    });
                if let Some(route_id) = found {
                    return route_id;
                }
                assert!(Instant::now() < deadline, "no route.start was sent");
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    }

    fn routing_note(events: &[EventKind]) -> Option<Message> {
        events.iter().find_map(|e| match e {
            EventKind::MessageCreated { message }
                if message.author.kind == AuthorKind::System
                    && message.author.id == ROUTING_AUTHOR =>
            {
                Some(message.clone())
            }
            _ => None,
        })
    }

    fn reply_to(events: &[EventKind], message_id: Uuid) -> Option<Message> {
        events.iter().find_map(|e| match e {
            EventKind::MessageCreated { message } if message.reply_to == Some(message_id) => {
                Some(message.clone())
            }
            _ => None,
        })
    }

    #[test]
    fn a_saved_mini_me_is_offered_in_the_next_route_start() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(LibraryStore::open(dir.path()));
        let f = fixture_with(Arc::clone(&store));
        let mut copy = store.current().mini_me(ASSISTANT).unwrap().clone();
        copy.id = Uuid::nil();
        copy.name = "Field Translator".into();
        let saved = store.save_mini_me(copy).unwrap();
        f.send("translate these field notes", &[], ROUTE_TIMEOUT).unwrap();
        f.route_id();
        let frames = f.sink.0.lock().unwrap().clone();
        let offered: Vec<Uuid> = frames
            .iter()
            .find_map(|frame| match frame {
                CoreFrame::RouteStart { mini_mes, .. } => {
                    Some(mini_mes.iter().map(|m| m.id).collect())
                }
                _ => None,
            })
            .unwrap();
        assert!(offered.contains(&saved.id));
    }

    #[test]
    fn no_file_question_without_files_or_with_a_tagged_one() {
        let f = fixture();
        let library = Library::builtin();
        let plain = message("check the data", &[]);
        let mut earlier = message("here it is", &[]);
        earlier.attachments.push(AssetRef {
            id: new_id(),
            name: "trial.csv".into(),
            media_type: "text/csv".into(),
            size_bytes: 1,
        });
        let mut tagged = message("check #trial.csv", &[]);
        tagged.attachments = earlier.attachments.clone();
        assert!(file_options(&f.project, &[plain.clone()], &plain, &library).is_empty());
        let messages = [earlier, tagged.clone()];
        assert!(file_options(&f.project, &messages, &tagged, &library).is_empty());

        f.send("check the data", &[], ROUTE_TIMEOUT).unwrap();
        f.route_id();
        let starts = sent(&f, |frame| matches!(frame, CoreFrame::RouteStart { .. }));
        let [CoreFrame::RouteStart { files, ask, .. }] = starts.as_slice() else {
            panic!("expected one route.start, got {starts:?}");
        };
        assert!(files.is_empty() && !ask.contains(&"file".to_string()));
    }

    #[test]
    fn a_mention_with_a_thumbs_up_gets_a_reply_and_a_reaction_from_that_mini_me() {
        let f = fixture();
        let sent = f
            .send(
                "@Assistant hi thanks",
                &[("@Assistant", ASSISTANT)],
                ROUTE_TIMEOUT,
            )
            .unwrap();
        let route_id = f.route_id();
        f.calls.handle(crate::link::SidecarFrame::RouteDone {
            route_id,
            answers: answers(vec![
                ("reaction", answer("👍", 0.9, &[])),
                ("needs_context", answer("no", 0.9, &[])),
            ]),
        });
        let assistant = Author {
            kind: AuthorKind::MiniMe,
            id: ASSISTANT.to_string(),
        };
        let events = f.wait_for("the reaction", |events| {
            events
                .iter()
                .any(|e| matches!(e, EventKind::ReactionAdded { .. }))
        });
        assert!(events.iter().any(|e| matches!(
            e,
            EventKind::ReactionAdded { message_id, emoji, by }
                if *message_id == sent.id && emoji == "👍" && *by == assistant
        )));
        let frames = f.sink.0.lock().unwrap().clone();
        let start = frames.iter().find_map(|frame| match frame {
            CoreFrame::RunStart { plan, .. } => Some((
                plan.traits[0].adapter.clone(),
                plan.traits[0].tools.clone(),
                plan.input.clone(),
                plan.context.needs_context,
            )),
            _ => None,
        });
        let tools = ["save_file", "show_table", "write_document", "suggest_edit", "edit_document"];
        let tools: Vec<String> = tools.map(String::from).to_vec();
        assert_eq!(
            start,
            Some(("prompt".into(), tools, json!({ "text": "hi thanks" }), Some(false)))
        );
    }

    #[test]
    fn a_second_message_waits_and_an_unanswered_route_falls_back_to_assistant() {
        let f = fixture();
        let first = f
            .send("late blight spreads", &[], Duration::from_millis(300))
            .unwrap();
        let second = f.send("and another", &[], ROUTE_TIMEOUT);
        assert_eq!(second.unwrap_err().code, "reply_in_progress");

        let events = f.wait_for("the reply", |events| reply_to(events, first.id).is_some());
        let reply = reply_to(&events, first.id).unwrap();
        assert_eq!(reply.author.id, FALLBACK_MINI_ME.to_string());
        assert_eq!(routing_note(&events), None);
    }

    #[test]
    fn a_reply_that_cannot_start_is_explained() {
        let f = fixture();
        f.calls.disconnect();
        let sent = f
            .send("@Assistant hi", &[("@Assistant", ASSISTANT)], ROUTE_TIMEOUT)
            .unwrap();
        let events = f.wait_for("the routing note", |events| routing_note(events).is_some());
        let note = routing_note(&events).unwrap();
        assert_eq!(note.reply_to, Some(sent.id));
        assert_eq!(note.status, MessageStatus::Complete);
        assert!(note.content.starts_with("Couldn't start a reply"));
    }

    /// The frames of the given types the sidecar has been sent.
    fn sent(f: &Fixture, of: impl Fn(&CoreFrame) -> bool) -> Vec<CoreFrame> {
        f.sink.0.lock().unwrap().iter().filter(|frame| of(frame)).cloned().collect()
    }

    #[test]
    fn a_note_in_a_thread_starts_no_run_and_asks_no_jev() {
        let f = fixture();
        into_thread(&f.project, f.conversation);
        let note = f.send("check the 2024 plots too", &[], ROUTE_TIMEOUT).unwrap();
        assert!(sent(&f, |_| true).is_empty());
        assert!(reply_to(&f.events(), note.id).is_none());
    }

    #[test]
    fn a_mention_in_a_thread_runs_that_mini_me_with_the_threads_history() {
        let f = fixture();
        into_thread(&f.project, f.conversation);
        let mention = [("@Assistant", ASSISTANT)];
        let comment = f.send("@Assistant shorten this", &mention, ROUTE_TIMEOUT).unwrap();
        assert!(sent(&f, |frame| matches!(frame, CoreFrame::RouteStart { .. })).is_empty());
        let starts = sent(&f, |frame| matches!(frame, CoreFrame::RunStart { .. }));
        let [CoreFrame::RunStart { plan, .. }] = starts.as_slice() else {
            panic!("expected one run.start, got {starts:?}");
        };
        assert_eq!((plan.mini_me.id, plan.context.needs_context), (ASSISTANT, Some(true)));
        assert!(reply_to(&f.events(), comment.id).is_some());

        let again = f.send("and the next one", &[], ROUTE_TIMEOUT).unwrap_err();
        assert_eq!(again.code, "reply_in_progress");
    }
}
