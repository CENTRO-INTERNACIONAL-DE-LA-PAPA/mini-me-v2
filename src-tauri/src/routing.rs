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
    use crate::link::AdapterInfo;
    use crate::protocol::{EventKind, MessageStatus, TextComponent, new_id};
    use crate::secrets::NoSecrets;
    use crate::sidecar::SidecarLog;
    use crate::runs::FrameSink;
    use crate::runs::test_support::Recorder;
    use crate::library::{FALLBACK_MINI_ME as ASSISTANT, SCRIBE};

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
        let (files, components) = ([cleaned], [chart]);
        let offered = Offered { files: &files, components: &components };
        let decided = |given: Vec<(&'static str, ChoiceAnswer)>| {
            decide(Some(&answers(given)), None, offered, 0.5, true, &library)
        };
        let unknown = new_id().to_string();
        let pick = |question: &'static str, choice: &str| (question, answer(choice, 0.99, &[]));

        assert_eq!(decided(vec![pick("mini_me", &unknown)]).answerer, FALLBACK_MINI_ME);
        assert_eq!(decided(vec![pick("mini_me", "Scribe")]).answerer, FALLBACK_MINI_ME);
        assert_eq!(decided(vec![pick("file", &unknown)]).file, None);
        assert_eq!(decided(vec![pick("component", &unknown)]).component, None);
        let scribe = SCRIBE.to_string();
        let next = answer("", 0.0, &[(&scribe, 0.1), (&unknown, 0.9)]);
        assert_eq!(decided(vec![("next_mini_me", next)]).hand_off, None);
    }

    struct Fixture {
        _dir: tempfile::TempDir,
        project: Arc<Project>,
        conversation: Uuid,
        calls: Arc<Runs>,
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
                show_answers: false,
                show_asked: false,
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
}
