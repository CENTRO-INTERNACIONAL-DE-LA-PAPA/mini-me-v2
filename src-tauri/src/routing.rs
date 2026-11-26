//! Jev decides who answers a message or a hand-off, any reaction, whether context is needed,
//! and hints at the file, component, tools and next Mini-Me; when Jev is unsure or cannot be
//! asked, the fallback Mini-Me answers.

use std::collections::HashSet;
use std::sync::{Arc, Mutex, Weak};
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
use crate::link::{
    CallModel, ChoiceAnswer, RouteComponent, RouteComponentOption, RouteFile, RouteMiniMe, RunComponent,
    RunFile, RunHandOff,
};
use crate::protocol::{Author, AuthorKind, ErrorInfo, Message, TextComponentKind};
use crate::runs::{HandedOff, RouteAnswers, Routed, RunSpec, Runs};
use crate::store::Project;
use crate::sync::{Watched, locked};

/// How long a message waits for Jev before the fallback Mini-Me answers it.
pub const ROUTE_TIMEOUT: Duration = Duration::from_secs(10);

/// The reactions Jev may choose besides `none`.
const REACTIONS: [&str; 16] = [
    "👍", "🎉", "💛", "😄", "😡", "😢", "🥔", "🤔", "😮", "💪", "🌱", "😅", "🙏", "☕", "🧪", "🌧️",
];

/// Below 1 so a one-topic Conversation does not get the same reaction on every message.
pub const REACTION_CHANCE: f64 = 0.5;

/// Earlier messages Jev sees, and characters of each.
const RECENT_TURNS: usize = 4;
const RECENT_CHARS: usize = 200;

/// What a routing decision depends on besides the message.
#[derive(Debug, Clone, PartialEq)]
pub struct RouteSettings {
    pub model: Option<CallModel>,
    pub threshold: f64,
    pub timeout: Duration,
    /// Store Jev's answers in the message's debug record (a developer setting).
    pub show_answers: bool,
    /// Store what was sent to Jev in the message's debug record (a developer setting).
    pub show_asked: bool,
    /// Share of confident reactions added, from 0 to 1.
    pub reaction_chance: f64,
}

/// A table or chart of a Conversation and its source file.
#[derive(Debug, Clone, PartialEq)]
pub struct ShownComponent {
    pub id: Uuid,
    pub kind: String,
    pub title: Option<String>,
    pub source_id: Uuid,
    pub source_name: String,
}

/// What Jev is asked about: a user's message or comment, or a Mini-Me's hand-off.
struct Request<'a> {
    project: &'a Arc<Project>,
    conversation_id: Uuid,
    /// The message the reply answers: the user's, or the reply that handed off.
    message: &'a Message,
    /// What Jev reads as the message, and the reply's input.
    text: String,
    files: Vec<String>,
    /// Who answers whatever Jev picks: the mentioned Mini-Me, or the one handed to.
    answerer: Option<Uuid>,
    handed_off: bool,
}

impl<'a> Request<'a> {
    fn message(project: &'a Arc<Project>, conversation_id: Uuid, message: &'a Message) -> Self {
        Self {
            project,
            conversation_id,
            message,
            text: input_text(message),
            files: conversations::file_names(message),
            answerer: first_mention(message),
            handed_off: false,
        }
    }

    fn hand_off(handed: &'a HandedOff) -> Self {
        Self {
            project: &handed.project,
            conversation_id: handed.conversation_id,
            message: &handed.reply,
            text: handed.request.clone(),
            files: handed.file.iter().map(|f| f.name.clone()).collect(),
            answerer: Some(handed.mini_me_id),
            handed_off: true,
        }
    }
}

/// The author ID of the notes that say why a message got no reply.
const ROUTING_AUTHOR: &str = "routing";

#[derive(Debug, Clone, PartialEq)]
struct Decision {
    answerer: Uuid,
    reaction: Option<String>,
    needs_context: Option<bool>,
    /// The Conversation's file the message means, when it tags none.
    file: Option<RunFile>,
    component: Option<RunComponent>,
    tools: Vec<String>,
    hand_off: Option<RunHandOff>,
}

/// Shown while Jev cannot choose, so the fallback answers every message without a mention.
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
    warning: Watched<Option<&'static str>>,
}

impl Routing {
    /// `has_key` is whether a Typesafe key is saved.
    pub fn new(library: Arc<LibraryStore>, has_key: bool) -> Arc<Self> {
        Arc::new(Self {
            library,
            pending: Mutex::new(HashSet::new()),
            warning: Watched::new((!has_key).then_some(NO_KEY)),
        })
    }

    /// Sends the current warning, then every change, until `sink` returns `false`.
    pub fn subscribe(&self, sink: WarningSink) {
        self.warning.subscribe(Box::new(move |warning| sink(*warning)));
    }

    /// Saving clears the warning (the next route confirms the key); removing warns.
    pub fn key_saved(&self, saved: bool) {
        self.warn(if saved { None } else { Some(NO_KEY) });
    }

    fn warn(&self, next: Option<&'static str>) {
        self.warning.set(next);
    }

    /// Routes on a background thread; `reply_in_progress` while an earlier message awaits routing.
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
        let message = {
            let mut pending = locked(&self.pending);
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
            locked(&this.pending)
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
        let request = Request::message(project, conversation_id, message);
        let decision = self.ask_jev(calls, settings, &request, &library);
        let model = settings.model.clone();
        match self.start_reply(&library, calls, &request, &decision, model, Some(settings)) {
            Ok(author) => react(project, message.id, decision.reaction, author),
            Err(err) => explain(project, conversation_id, message.id, &err),
        }
    }

    /// On its own thread, since Jev's answer arrives on the thread that reported the run's end.
    pub fn hand_off(self: &Arc<Self>, calls: Weak<Runs>, handed: HandedOff) {
        let this = Arc::clone(self);
        std::thread::spawn(move || {
            if let Some(calls) = calls.upgrade() {
                this.route_hand_off(&calls, handed);
            }
        });
    }

    /// Without routing settings, as for a resumed run, the reply starts without Jev's hints.
    fn route_hand_off(&self, calls: &Runs, handed: HandedOff) {
        let library = self.library.current();
        let request = Request::hand_off(&handed);
        let mut decision = match &handed.route {
            Some(settings) => self.ask_jev(calls, settings, &request, &library),
            None => decide(None, request.answerer, Offered::default(), 1.0, false, &library),
        };
        decision.needs_context = decision.needs_context.or(Some(true));
        if handed.file.is_some() {
            decision.file = handed.file.clone();
        }
        let model = handed.model.clone();
        let started =
            self.start_reply(&library, calls, &request, &decision, model, handed.route.as_ref());
        if let Err(err) = started {
            explain(&handed.project, handed.conversation_id, handed.reply.id, &err);
        }
    }

    /// Without Jev's answers the mentioned or handed-to Mini-Me, or else the fallback, answers.
    fn ask_jev(
        &self,
        calls: &Runs,
        settings: &RouteSettings,
        request: &Request,
        library: &Library,
    ) -> Decision {
        let (project, conversation_id, message) =
            (request.project, request.conversation_id, request.message);
        let messages = project.lock().conversation_messages(conversation_id).unwrap_or_default();
        // A thread's document is already its reply's context, so Jev picks no file,
        // component or tools there.
        let in_thread = comments::is_thread(&project.lock(), conversation_id).unwrap_or(false);
        let (files, components) = match in_thread {
            true => (Vec::new(), Vec::new()),
            false => {
                let shown = project.lock().shown_components(conversation_id).unwrap_or_default();
                let files = match request.files.is_empty() {
                    true => file_options(project, &messages, message.id, library, &shown),
                    false => Vec::new(),
                };
                (files, component_options(shown))
            }
        };
        let ask = questions(Asks {
            mini_me: request.answerer.is_none(),
            reaction: !request.handed_off,
            file: !files.is_empty(),
            component: !components.is_empty(),
            tools: !in_thread,
        });
        let state = state(request, recent(seen_before(&messages, request), library));
        let mini_mes = route_mini_mes(library);
        let Routed { answers: routed, asked } =
            calls.route(state, mini_mes, files.clone(), components.clone(), ask, settings.timeout);
        if let Some(record) = jev_record(&routed, asked, settings) {
            let stored = project.lock().put_debug_record(conversation_id, message.id, "jev", &record);
            if let Err(err) = stored {
                eprintln!("could not store Jev's record: {err}");
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
        let offered = Offered { files: &files, components: &components };
        decide(answers.as_ref(), request.answerer, offered, settings.threshold, reacts, library)
    }

    /// Returns the reply's author.
    fn start_reply(
        &self,
        library: &Library,
        calls: &Runs,
        request: &Request,
        decision: &Decision,
        model: Option<CallModel>,
        route: Option<&RouteSettings>,
    ) -> AppResult<Author> {
        let author = Author {
            kind: AuthorKind::MiniMe,
            id: decision.answerer.to_string(),
        };
        let input = json!({ "text": request.text });
        let mut spec = RunSpec::for_mini_me(
            library,
            decision.answerer,
            author.clone(),
            input,
            decision.needs_context,
        )?;
        spec.file = decision.file.clone();
        spec.component = decision.component.clone();
        spec.tools = decision.tools.clone();
        spec.hand_off = decision.hand_off.clone();
        spec.route = route.cloned();
        let (project, conversation_id) = (Arc::clone(request.project), request.conversation_id);
        calls.start(project, conversation_id, request.message, spec, model)?;
        Ok(author)
    }
}

/// Which of the optional questions Jev is asked besides `reaction`, `needs_context` and
/// `next_mini_me`.
struct Asks {
    mini_me: bool,
    reaction: bool,
    file: bool,
    component: bool,
    tools: bool,
}

fn questions(asks: Asks) -> Vec<String> {
    let optional = |asked: bool, id: &str| asked.then(|| id.to_string());
    [
        optional(asks.mini_me, "mini_me"),
        optional(asks.reaction, "reaction"),
        Some("needs_context".to_string()),
        optional(asks.file, "file"),
        optional(asks.component, "component"),
        optional(asks.tools, "tools"),
        Some("next_mini_me".to_string()),
    ]
    .into_iter()
    .flatten()
    .collect()
}

pub fn route_mini_mes(library: &Library) -> Vec<RouteMiniMe> {
    library
        .mini_mes
        .iter()
        .map(|m| RouteMiniMe {
            id: m.id,
            name: m.name.clone(),
            description: m.description.clone(),
            traits: library.workflow_traits(&m.workflow).iter().map(|t| t.name.clone()).collect(),
        })
        .collect()
}

fn react(project: &Project, message_id: Uuid, reaction: Option<String>, author: Author) {
    if let Some(emoji) = reaction {
        if let Err(err) = conversations::add_reaction(project, message_id, &emoji, author) {
            eprintln!("could not add the reaction: {err}");
        }
    }
}

/// Notes under the message `message_id` why no reply could start.
pub fn explain(project: &Project, conversation_id: Uuid, message_id: Uuid, err: &AppError) {
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

/// What Jev sees of a request; file contents stay on the user's computer.
fn state(request: &Request, recent: Value) -> Value {
    json!({
        "message": request.text,
        "files": request.files,
        "recent": recent,
    })
}

/// The messages before a user's message, or up to and including the reply that handed off.
fn seen_before<'m>(messages: &'m [Message], request: &Request) -> &'m [Message] {
    let at = messages.iter().position(|m| m.id == request.message.id).unwrap_or(messages.len());
    let end = if request.handed_off { (at + 1).min(messages.len()) } else { at };
    &messages[..end]
}

/// The last `RECENT_TURNS` turns, oldest first, without components (table data).
fn recent(earlier: &[Message], library: &Library) -> Value {
    let earlier: Vec<&Message> =
        earlier.iter().filter(|m| m.author.kind != AuthorKind::System).collect();
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

/// `None` keeps the current warning, as for a stopped runtime, which the sidecar status explains.
fn warning_after(routed: &AppResult<RouteAnswers>) -> Option<Option<&'static str>> {
    match routed {
        Ok(_) => Some(None),
        Err(err) if err.code == "sidecar_stopped" => None,
        Err(err) if err.code == "secret_unavailable" => Some(Some(NO_KEY)),
        Err(_) => Some(Some(NOT_ANSWERING)),
    }
}

/// Files Jev may pick, newest first, with the tables and charts in `shown` made from each.
fn file_options(
    project: &Project,
    messages: &[Message],
    message_id: Uuid,
    library: &Library,
    shown: &[ShownComponent],
) -> Vec<RouteFile> {
    let state = project.lock();
    let found = results(messages, message_id, message_id, library, |id| {
        assets::find_with_hidden(&state, id).ok()
    });
    found
        .assets
        .into_iter()
        .map(|a| RouteFile {
            id: a.asset.id,
            components: shown
                .iter()
                .filter(|c| c.source_id == a.asset.id)
                .map(|c| RouteComponent { kind: c.kind.clone(), title: c.title.clone() })
                .collect(),
            name: a.asset.name,
        })
        .collect()
}

fn component_options(shown: Vec<ShownComponent>) -> Vec<RouteComponentOption> {
    shown
        .into_iter()
        .map(|c| RouteComponentOption {
            id: c.id,
            kind: c.kind,
            title: c.title,
            file: c.source_name,
        })
        .collect()
}

/// `{ asked, answers, error }`, only parts whose developer setting is on; `None` if both are off.
fn jev_record(
    routed: &AppResult<RouteAnswers>,
    asked: Value,
    settings: &RouteSettings,
) -> Option<Value> {
    if !settings.show_answers && !settings.show_asked {
        return None;
    }
    let (answers, error) = match routed {
        _ if !settings.show_answers => (Value::Null, None),
        Ok(answers) => (json!(answers), None),
        Err(err) => (
            Value::Null,
            Some(ErrorInfo {
                code: err.code.clone(),
                message: err.message.clone(),
            }),
        ),
    };
    let asked = if settings.show_asked { asked } else { Value::Null };
    Some(json!({ "asked": asked, "answers": answers, "error": error }))
}

/// A random number from 0 up to 1, taken from the random bits of a new UUIDv7.
fn draw() -> f64 {
    let (_, random) = Uuid::now_v7().as_u64_pair();
    (random & ((1 << 53) - 1)) as f64 / (1u64 << 53) as f64
}

/// How many of Jev's most probable tools a reply is told about.
const LIKELY_TOOLS: usize = 4;

/// The options Jev was offered for the questions whose answer must be one of them.
#[derive(Clone, Copy, Default)]
struct Offered<'a> {
    files: &'a [RouteFile],
    components: &'a [RouteComponentOption],
}

/// A confidence equal to the threshold passes, and a reaction only when `reacts`; else the
/// fallback answers and no file is picked.
fn decide(
    answers: Option<&RouteAnswers>,
    mentioned: Option<Uuid>,
    offered: Offered,
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
        .and_then(|f| offered.files.iter().find(|o| o.id.to_string() == f.choice))
        .map(|o| RunFile {
            asset_id: o.id,
            name: o.name.clone(),
        });
    let component = answer("component")
        .filter(|c| c.confidence >= threshold)
        .and_then(|c| offered.components.iter().find(|o| o.id.to_string() == c.choice))
        .map(|o| RunComponent { component_id: o.id });
    let tools = answer("tools").map(likely_tools).unwrap_or_default();
    let hand_off = answer("next_mini_me")
        .and_then(|next| handed_to(next, answerer, threshold, library))
        .map(|mini_me_id| RunHandOff { mini_me_id });
    Decision {
        answerer,
        reaction,
        needs_context,
        file,
        component,
        tools,
        hand_off,
    }
}

/// The most probable Mini-Me other than `answerer`, when all of them together reach `threshold`,
/// since Jev often splits a hand-off between Mini-Mes that could all do it.
fn handed_to(answer: &ChoiceAnswer, answerer: Uuid, threshold: f64, library: &Library) -> Option<Uuid> {
    let others: Vec<(Uuid, f64)> = answer
        .probabilities
        .iter()
        .filter_map(|(option, p)| Some((Uuid::parse_str(option).ok()?, *p)))
        .filter(|(id, _)| *id != answerer && library.mini_me(*id).is_some())
        .collect();
    if others.iter().map(|(_, p)| p).sum::<f64>() < threshold {
        return None;
    }
    others.into_iter().max_by(|a, b| a.1.total_cmp(&b.1)).map(|(id, _)| id)
}

/// The most probable tools, most probable first, whatever their confidence.
fn likely_tools(answer: &ChoiceAnswer) -> Vec<String> {
    let mut tools: Vec<(&String, f64)> = answer
        .probabilities
        .iter()
        .filter(|(tool, _)| tool.as_str() != "none")
        .map(|(tool, p)| (tool, *p))
        .collect();
    tools.sort_by(|a, b| b.1.total_cmp(&a.1));
    tools.into_iter().take(LIKELY_TOOLS).map(|(tool, _)| tool.clone()).collect()
}

/// A mention between two spaces takes one along, leaving no double space; offsets are UTF-16 units.
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
    use crate::link::{AdapterInfo, CoreFrame};
    use crate::protocol::{EventKind, MessageStatus, TextComponent, new_id};
    use crate::secrets::NoSecrets;
    use crate::sidecar::SidecarLog;
    use crate::runs::FrameSink;
    use crate::runs::test_support::Recorder;
    use crate::library::{FALLBACK_MINI_ME as ASSISTANT, SCRIBE, Step, StepKind};

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
    fn jevs_answers_decide_who_answers_and_how() {
        let library = Library::builtin();
        let decided = |given: Vec<(&'static str, ChoiceAnswer)>, mentioned, reacts| {
            let given = answers(given);
            let d = decide(Some(&given), mentioned, Offered::default(), 0.5, reacts, &library);
            (d.answerer, d.reaction, d.needs_context)
        };
        let mini_me = |id: Uuid, confidence| ("mini_me", answer(&id.to_string(), confidence, &[]));
        let reaction = |emoji: &str, confidence| ("reaction", answer(emoji, confidence, &[]));
        let context = |choice: &str| ("needs_context", answer(choice, 0.9, &[]));

        // Jev's pick answers at or above the threshold; below it, or unknown, the fallback does.
        assert_eq!(decided(vec![mini_me(SCRIBE, 0.5)], None, true).0, SCRIBE);
        assert_eq!(decided(vec![mini_me(SCRIBE, 0.3)], None, true).0, FALLBACK_MINI_ME);
        assert_eq!(decided(vec![mini_me(new_id(), 0.99)], None, true).0, FALLBACK_MINI_ME);
        // The fallback reacts under the same threshold as any Mini-Me.
        assert_eq!(
            decided(vec![mini_me(SCRIBE, 0.3), reaction("👍", 0.8)], None, true),
            (FALLBACK_MINI_ME, Some("👍".into()), None)
        );
        // Reaction and context follow Jev; a low confidence, "none" or a failed draw mean none.
        assert_eq!(
            decided(vec![reaction("👍", 0.8), context("yes")], Some(SCRIBE), true),
            (SCRIBE, Some("👍".into()), Some(true))
        );
        assert_eq!(
            decided(vec![reaction("🎉", 0.4), context("no")], Some(SCRIBE), true),
            (SCRIBE, None, Some(false))
        );
        assert_eq!(decided(vec![reaction("none", 0.99)], Some(SCRIBE), true).1, None);
        assert_eq!(decided(vec![reaction("🥔", 0.9)], Some(SCRIBE), false).1, None);
    }

    #[test]
    fn without_jev_a_mentioned_mini_me_answers_or_else_the_fallback() {
        let library = Library::builtin();
        let none = Offered::default();
        assert_eq!(decide(None, None, none, 0.5, true, &library).answerer, FALLBACK_MINI_ME);
        let mentioned = decide(None, Some(SCRIBE), none, 0.5, true, &library);
        let expected = Decision {
            answerer: SCRIBE,
            reaction: None,
            needs_context: None,
            file: None,
            component: None,
            tools: Vec::new(),
            hand_off: None,
        };
        assert_eq!(mentioned, expected);
    }

    #[test]
    fn jev_picks_one_of_the_offered_files_and_components_at_or_above_the_threshold() {
        let library = Library::builtin();
        let cleaned = RouteFile {
            id: new_id(),
            name: "field-trial-cleaned.csv".into(),
            components: Vec::new(),
        };
        let chart = RouteComponentOption {
            id: new_id(),
            kind: "chart".into(),
            title: Some("Yield by variety".into()),
            file: "field-trial.csv".into(),
        };
        let (files, components) = ([cleaned.clone()], [chart.clone()]);
        let offered = Offered { files: &files, components: &components };
        let pick = |question: &'static str, choice: &str, confidence: f64| {
            let answers = answers(vec![(question, answer(choice, confidence, &[]))]);
            decide(Some(&answers), None, offered, 0.5, true, &library)
        };
        let picked = RunFile { asset_id: cleaned.id, name: cleaned.name.clone() };
        assert_eq!(pick("file", &cleaned.id.to_string(), 0.5).file, Some(picked));
        assert_eq!(pick("file", &cleaned.id.to_string(), 0.4).file, None);
        assert_eq!(pick("file", "none", 0.9).file, None);
        assert_eq!(pick("file", &new_id().to_string(), 0.9).file, None);
        let picked = RunComponent { component_id: chart.id };
        assert_eq!(pick("component", &chart.id.to_string(), 0.5).component, Some(picked));
        assert_eq!(pick("component", &chart.id.to_string(), 0.4).component, None);
        assert_eq!(pick("component", "none", 0.9).component, None);
        assert_eq!(pick("component", &new_id().to_string(), 0.9).component, None);
    }

    #[test]
    fn the_four_most_probable_tools_are_passed_on_without_none() {
        let library = Library::builtin();
        let probabilities = [
            ("read_file", 0.1),
            ("show_table", 0.4),
            ("none", 0.2),
            ("suggest", 0.02),
            ("save_file", 0.15),
            ("read_component", 0.08),
            ("write_document", 0.05),
        ];
        let given = answers(vec![("tools", answer("show_table", 0.4, &probabilities))]);
        let decided = decide(Some(&given), None, Offered::default(), 0.5, true, &library);
        assert_eq!(decided.tools, ["show_table", "save_file", "read_file", "read_component"]);
    }

    #[test]
    fn jev_recommends_the_top_other_mini_me_when_the_others_reach_the_threshold() {
        let library = Library::builtin();
        let third = library.mini_mes.iter().find(|m| m.id != SCRIBE && m.id != ASSISTANT);
        let (scribe, third) = (SCRIBE.to_string(), third.unwrap().id.to_string());
        let (assistant, unknown) = (ASSISTANT.to_string(), new_id().to_string());
        let next = |probabilities: &[(&str, f64)]| {
            let given = answers(vec![("next_mini_me", answer("", 0.0, probabilities))]);
            decide(Some(&given), Some(ASSISTANT), Offered::default(), 0.5, true, &library).hand_off
        };
        let to_scribe = Some(RunHandOff { mini_me_id: SCRIBE });
        // Split between two others, neither alone at the threshold.
        assert_eq!(next(&[(&scribe, 0.3), (&third, 0.2), ("none", 0.5)]), to_scribe);
        assert_eq!(next(&[(&scribe, 0.3), (&third, 0.1), ("none", 0.6)]), None);
        // The answerer and unknown Mini-Mes don't count.
        assert_eq!(next(&[(&scribe, 0.1), (&assistant, 0.9)]), None);
        assert_eq!(next(&[(&scribe, 0.1), (&unknown, 0.9)]), None);
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
        let f = fixture();
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
            state(&Request::message(&f.project, f.conversation, &sent), json!([])),
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
        let turns = recent(&messages[..6], &Library::builtin());
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

    struct Fixture {
        _dir: tempfile::TempDir,
        project: Arc<Project>,
        conversation: Uuid,
        calls: Arc<Runs>,
        sink: Arc<Recorder>,
        routing: Arc<Routing>,
        /// Whether messages are sent with both Jev debug settings on.
        debug: bool,
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
            debug: false,
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
            self.routing.send(
                Arc::clone(&self.calls),
                self.settings(timeout),
                Arc::clone(&self.project),
                self.conversation,
                input,
                new_id(),
            )
        }

        fn settings(&self, timeout: Duration) -> RouteSettings {
            RouteSettings {
                model: Some(CallModel {
                    provider: "dummy".into(),
                    model: "dummy-model".into(),
                    ..Default::default()
                }),
                threshold: 0.5,
                timeout,
                show_answers: self.debug,
                show_asked: self.debug,
                reaction_chance: 1.0,
            }
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
    fn no_file_or_component_question_without_them() {
        let f = fixture();
        f.send("check the data", &[], ROUTE_TIMEOUT).unwrap();
        f.route_id();
        let starts = sent(&f, |frame| matches!(frame, CoreFrame::RouteStart { .. }));
        let [CoreFrame::RouteStart { files, components, ask, .. }] = starts.as_slice() else {
            panic!("expected one route.start, got {starts:?}");
        };
        assert!(files.is_empty() && components.is_empty());
        assert_eq!(ask, &["mini_me", "reaction", "needs_context", "tools", "next_mini_me"]);
    }

    #[test]
    fn file_and_component_options_list_the_tables_and_charts_newest_first() {
        let f = fixture();
        let input = SendMessageInput {
            content: "plot the trial".into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let question =
            conversations::send_message(&f.project, f.conversation, input, new_id()).unwrap();
        let plotter = Author { kind: AuthorKind::MiniMe, id: "plotter".into() };
        let author = plotter.clone();
        let reply =
            conversations::start_reply(&f.project, f.conversation, question.id, author).unwrap();
        let file = ("field-trial.csv", "text/csv", b"plot\n1\n".as_slice());
        let asset =
            conversations::attach_generated(&f.project, reply, &plotter, file, false).unwrap();
        let shown = [("table", "Field trial"), ("chart", "Yield by variety")];
        let mut ids = Vec::new();
        for (kind, title) in shown {
            let component = conversations::NewComponent {
                kind: kind.into(),
                version: 1,
                preview: json!({ "source": asset.name, "title": title }),
                text: title.to_string(),
                source_asset_id: Some(asset.id),
            };
            ids.push(conversations::add_component(&f.project, reply, None, component).unwrap());
        }
        conversations::complete_reply(&f.project, reply).unwrap();

        f.send("make that chart a bar chart", &[], ROUTE_TIMEOUT).unwrap();
        f.route_id();
        let starts = sent(&f, |frame| matches!(frame, CoreFrame::RouteStart { .. }));
        let [CoreFrame::RouteStart { files, components, ask, .. }] = starts.as_slice() else {
            panic!("expected one route.start, got {starts:?}");
        };
        let component = |kind: &str, title: &str| RouteComponent {
            kind: kind.into(),
            title: Some(title.into()),
        };
        let expected = RouteFile {
            id: asset.id,
            name: asset.name.clone(),
            components: vec![
                component("chart", "Yield by variety"),
                component("table", "Field trial"),
            ],
        };
        assert_eq!(files, &vec![expected]);
        let option = |id: Uuid, kind: &str, title: &str| RouteComponentOption {
            id,
            kind: kind.into(),
            title: Some(title.into()),
            file: asset.name.clone(),
        };
        let expected =
            vec![option(ids[1], "chart", "Yield by variety"), option(ids[0], "table", "Field trial")];
        assert_eq!(components, &expected);
        assert!(ask.contains(&"component".to_string()));
    }

    #[test]
    fn a_mini_me_option_names_its_traits_once_in_workflow_order() {
        let mut library = Library::builtin();
        let (first, second) = (library.traits[0].clone(), library.traits[1].clone());
        let step = |id: &str, trait_id: Uuid| Step {
            id: id.into(),
            label: None,
            kind: StepKind::Trait { trait_id, show_results: false },
        };
        library.mini_mes[0].workflow.steps =
            vec![step("a", second.id), step("b", first.id), step("c", second.id)];
        let option = &route_mini_mes(&library)[0];
        assert_eq!(option.traits, vec![second.name, first.name]);
    }

    #[test]
    fn jevs_record_holds_only_the_parts_whose_setting_is_on() {
        let settings = |show_answers: bool, show_asked: bool| RouteSettings {
            model: None,
            threshold: 0.5,
            timeout: ROUTE_TIMEOUT,
            show_answers,
            show_asked,
            reaction_chance: 1.0,
        };
        let asked = json!({ "state": { "message": "hi" }, "questions": {} });
        let thumbs_up = answers(vec![("reaction", answer("👍", 0.9, &[]))]);
        let answered: AppResult<RouteAnswers> = Ok(thumbs_up);
        let timed_out: AppResult<RouteAnswers> =
            Err(AppError::new("jev_timeout", "Typesafe did not answer in time."));
        let record = |routed: &AppResult<RouteAnswers>, on: (bool, bool)| {
            jev_record(routed, asked.clone(), &settings(on.0, on.1))
        };

        let both = record(&answered, (true, true)).unwrap();
        assert_eq!(both["asked"], asked);
        assert_eq!(both["answers"]["reaction"]["choice"], json!("👍"));
        let only_answers = record(&answered, (true, false)).unwrap();
        assert_eq!((&only_answers["asked"], &only_answers["error"]), (&Value::Null, &Value::Null));
        let late = record(&timed_out, (true, true)).unwrap();
        assert_eq!(late["answers"], Value::Null);
        assert_eq!(late["error"]["code"], json!("jev_timeout"));
        assert_eq!(record(&answered, (false, false)), None);
    }

    #[test]
    fn jevs_record_is_stored_with_the_message() {
        let mut f = fixture();
        f.debug = true;
        let sent = f.send("check the data", &[], ROUTE_TIMEOUT).unwrap();
        let route_id = f.route_id();
        let asked = json!({ "state": { "message": "check the data" }, "questions": {} });
        f.calls.handle(crate::link::SidecarFrame::RouteDone {
            route_id,
            answers: answers(vec![("needs_context", answer("no", 0.9, &[]))]),
            asked: asked.clone(),
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        let record = loop {
            if let Some(record) = f.project.lock().debug_records(sent.id, "jev").unwrap().pop() {
                break record;
            }
            assert!(Instant::now() < deadline, "no jev record was stored");
            std::thread::sleep(Duration::from_millis(10));
        };
        assert_eq!(record["asked"], asked);
        assert_eq!(record["answers"]["needs_context"]["choice"], json!("no"));
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
                ("tools", answer("save_file", 0.6, &[("save_file", 0.6), ("none", 0.4)])),
            ]),
            asked: Value::Null,
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
        let plan = frames
            .iter()
            .find_map(|frame| match frame {
                CoreFrame::RunStart { plan, .. } => Some(plan.clone()),
                _ => None,
            })
            .unwrap();
        assert_eq!(plan.traits[0].adapter, "prompt");
        assert_eq!(plan.input, json!({ "text": "hi thanks" }));
        assert_eq!(plan.context.needs_context, Some(false));
        assert_eq!(plan.context.tools, ["save_file"]);
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
    fn a_comment_is_routed_like_a_message_without_the_file_component_and_tools_questions() {
        let f = fixture();
        into_thread(&f.project, f.conversation);
        let comment = f.send("too long", &[], Duration::from_millis(300)).unwrap();
        f.route_id();
        let starts = sent(&f, |frame| matches!(frame, CoreFrame::RouteStart { .. }));
        let [CoreFrame::RouteStart { files, ask, .. }] = starts.as_slice() else {
            panic!("expected one route.start, got {starts:?}");
        };
        assert!(files.is_empty());
        assert_eq!(ask, &["mini_me", "reaction", "needs_context", "next_mini_me"]);

        let events = f.wait_for("the reply", |events| reply_to(events, comment.id).is_some());
        let reply = reply_to(&events, comment.id).unwrap();
        assert_eq!(reply.author.id, FALLBACK_MINI_ME.to_string());
    }

    #[test]
    fn a_hand_off_is_routed_without_mini_me_reaction_or_a_passed_files_question() {
        let f = fixture();
        let question = f.send("@Assistant hi", &[("@Assistant", ASSISTANT)], ROUTE_TIMEOUT);
        let question = question.unwrap();
        f.route_id();
        let assistant = Author { kind: AuthorKind::MiniMe, id: ASSISTANT.to_string() };
        let reply = conversations::start_reply(&f.project, f.conversation, question.id, assistant);
        let reply = reply.unwrap();
        conversations::complete_reply(&f.project, reply).unwrap();
        let reply = f.project.lock().load_message_with(reply, false).unwrap().unwrap().1;
        let file = RunFile { asset_id: new_id(), name: "trial.csv".into() };
        let settings = f.settings(Duration::from_millis(200));
        f.sink.0.lock().unwrap().clear();
        let handed = HandedOff {
            project: Arc::clone(&f.project),
            conversation_id: f.conversation,
            reply: reply.clone(),
            mini_me_id: SCRIBE,
            request: "summarize this".into(),
            file: Some(file.clone()),
            model: settings.model.clone(),
            route: Some(settings),
        };
        f.routing.route_hand_off(&f.calls, handed);

        let starts = sent(&f, |frame| matches!(frame, CoreFrame::RouteStart { .. }));
        let [CoreFrame::RouteStart { state, files, ask, .. }] = starts.as_slice() else {
            panic!("expected one route.start, got {starts:?}");
        };
        assert!(files.is_empty());
        assert_eq!(ask, &["needs_context", "tools", "next_mini_me"]);
        assert_eq!((&state["message"], &state["files"]), (&json!("summarize this"), &json!(["trial.csv"])));
        assert_eq!(state["recent"].as_array().unwrap().last().unwrap()["name"], "Assistant");

        let runs = sent(&f, |frame| matches!(frame, CoreFrame::RunStart { .. }));
        let [CoreFrame::RunStart { plan, .. }] = runs.as_slice() else {
            panic!("expected one run.start, got {runs:?}");
        };
        assert_eq!((plan.mini_me.id, &plan.input), (SCRIBE, &json!({ "text": "summarize this" })));
        assert_eq!((plan.context.message.id, plan.context.needs_context), (reply.id, Some(true)));
        assert_eq!(plan.context.file, Some(file));
    }
}
