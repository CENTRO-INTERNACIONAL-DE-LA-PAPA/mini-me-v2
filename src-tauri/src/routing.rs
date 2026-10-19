//! Which Mini-Me answers a user message, whether it also reacts to it, and whether the
//! message needs earlier context, as decided by Typesafe's Jev. When Jev is unsure or cannot
//! be asked, the fallback Mini-Me answers.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use uuid::Uuid;

use crate::conversations::{self, SendMessageInput};
use crate::error::{AppError, AppResult};
use crate::library::{FALLBACK_MINI_ME, Library};
use crate::link::{CallModel, RouteMiniMe};
use crate::protocol::{Author, AuthorKind, ErrorInfo, Message, TextComponentKind};
use crate::runs::{RouteAnswers, RunSpec, Runs};
use crate::store::Project;

/// How long a message waits for Jev before the fallback Mini-Me answers it.
pub const ROUTE_TIMEOUT: Duration = Duration::from_secs(10);

/// The reactions Jev may choose besides `none`.
const REACTIONS: [&str; 7] = ["👍", "🎉", "💛", "😄", "😡", "😢", "🥔"];

/// What a routing decision depends on besides the message.
#[derive(Debug, Clone)]
pub struct RouteSettings {
    pub model: Option<CallModel>,
    pub threshold: f64,
    pub timeout: Duration,
    /// Store Jev's raw answers with the message (a developer setting).
    pub show_answers: bool,
}

/// The author ID of the notes that say why a message got no reply.
const ROUTING_AUTHOR: &str = "routing";

#[derive(Debug, Clone, PartialEq)]
struct Decision {
    /// The Mini-Me that answers.
    answerer: Uuid,
    reaction: Option<String>,
    needs_context: Option<bool>,
}

pub struct Routing {
    library: Arc<Library>,
    /// Conversations whose latest message is waiting for a routing decision.
    pending: Mutex<HashSet<Uuid>>,
}

impl Routing {
    pub fn new(library: Arc<Library>) -> Arc<Self> {
        Arc::new(Self {
            library,
            pending: Mutex::new(HashSet::new()),
        })
    }

    pub fn library(&self) -> &Library {
        &self.library
    }

    /// Validates and persists a user message, then decides on a background thread who
    /// answers it. Fails with `reply_in_progress` while an earlier message of the
    /// Conversation is still waiting for its decision.
    pub fn send(
        self: &Arc<Self>,
        calls: Arc<Runs>,
        settings: RouteSettings,
        project: Arc<Project>,
        conversation_id: Uuid,
        input: SendMessageInput,
        user_id: Uuid,
    ) -> AppResult<Message> {
        check_mentions(&input, &self.library)?;
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
        let mentioned = first_mention(message);
        let mut ask = vec!["reaction".to_string(), "needs_context".to_string()];
        if mentioned.is_none() {
            ask.insert(0, "mini_me".to_string());
        }
        let mini_mes = self
            .library
            .summaries()
            .into_iter()
            .map(|m| RouteMiniMe {
                id: m.id,
                name: m.name,
                description: m.description,
            })
            .collect();
        let routed = calls.route(state(message), mini_mes, ask, settings.timeout);
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
        let answers = match routed {
            Ok(answers) => Some(answers),
            Err(err) => {
                eprintln!("no routing decision: {err}");
                None
            }
        };
        let decision = decide(
            answers.as_ref(),
            mentioned,
            settings.threshold,
            &self.library,
        );
        let started = self.start_reply(
            calls,
            settings.model.clone(),
            project,
            conversation_id,
            message,
            decision.answerer,
            decision.needs_context,
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
            Err(err) => {
                eprintln!("could not start a reply: {err}");
                let content = format!("Couldn't start a reply: {}", err.message);
                if let Err(err) = conversations::system_reply(
                    project,
                    conversation_id,
                    message.id,
                    ROUTING_AUTHOR,
                    &content,
                ) {
                    eprintln!("could not say why there is no reply: {err}");
                }
            }
        }
    }

    /// Starts `mini_me_id`'s reply to `message`; returns the reply's author.
    fn start_reply(
        &self,
        calls: &Runs,
        model: Option<CallModel>,
        project: &Arc<Project>,
        conversation_id: Uuid,
        message: &Message,
        mini_me_id: Uuid,
        needs_context: Option<bool>,
    ) -> AppResult<Author> {
        let author = Author {
            kind: AuthorKind::MiniMe,
            id: mini_me_id.to_string(),
        };
        let input = json!({ "text": input_text(message) });
        let spec =
            RunSpec::for_mini_me(&self.library, mini_me_id, author.clone(), input, needs_context)?;
        calls.start(Arc::clone(project), conversation_id, message, spec, model)?;
        Ok(author)
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

/// What Jev sees of a message: its text without mentions and the names of its files. File
/// contents stay on the user's computer.
fn state(message: &Message) -> Value {
    json!({ "message": input_text(message), "files": conversations::file_names(message) })
}

/// Turns Jev's answers (`None` when Jev could not be asked) into who answers, the reaction
/// and the context answer. A confidence equal to the threshold passes; below it, or without
/// an answer, the fallback Mini-Me answers.
fn decide(
    answers: Option<&RouteAnswers>,
    mentioned: Option<Uuid>,
    threshold: f64,
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
        .map(|r| r.choice.clone());
    let needs_context = answer("needs_context").and_then(|c| match c.choice.as_str() {
        "yes" => Some(true),
        "no" => Some(false),
        _ => None,
    });
    Decision {
        answerer,
        reaction,
        needs_context,
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
    use crate::link::{AdapterInfo, ChoiceAnswer, CoreFrame};
    use crate::protocol::{EventKind, MessageStatus, TextComponent, new_id};
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
            decide(Some(&sure), None, 0.5, &library).answerer,
            SCRIBE
        );
    }

    #[test]
    fn low_confidence_or_an_unknown_mini_me_falls_back() {
        let library = Library::builtin();
        let unsure = answers(vec![("mini_me", answer(&SCRIBE.to_string(), 0.3, &[]))]);
        assert_eq!(
            decide(Some(&unsure), None, 0.5, &library).answerer,
            FALLBACK_MINI_ME
        );
        let unknown = answers(vec![("mini_me", answer(&new_id().to_string(), 0.99, &[]))]);
        assert_eq!(
            decide(Some(&unknown), None, 0.5, &library).answerer,
            FALLBACK_MINI_ME
        );
    }

    #[test]
    fn without_jev_a_mentioned_mini_me_answers_or_else_the_fallback() {
        let library = Library::builtin();
        assert_eq!(
            decide(None, None, 0.5, &library),
            Decision {
                answerer: FALLBACK_MINI_ME,
                reaction: None,
                needs_context: None,
            }
        );
        assert_eq!(
            decide(None, Some(SCRIBE), 0.5, &library),
            Decision {
                answerer: SCRIBE,
                reaction: None,
                needs_context: None,
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
        let decision = decide(Some(&unsure), None, 0.5, &library);
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
        let decision = decide(Some(&confident), Some(SCRIBE), 0.5, &library);
        assert_eq!(decision.reaction.as_deref(), Some("👍"));
        assert_eq!(decision.needs_context, Some(true));

        let unsure = answers(vec![
            ("reaction", answer("🎉", 0.4, &[])),
            ("needs_context", answer("no", 0.9, &[])),
        ]);
        let decision = decide(Some(&unsure), Some(SCRIBE), 0.5, &library);
        assert_eq!(decision.reaction, None);
        assert_eq!(decision.needs_context, Some(false));

        let none = answers(vec![("reaction", answer("none", 0.99, &[]))]);
        assert_eq!(
            decide(Some(&none), Some(SCRIBE), 0.5, &library).reaction,
            None
        );
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
            state(&sent),
            json!({ "message": "summarize #notes.txt", "files": ["notes.txt"] })
        );
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
        let library = Arc::new(Library::builtin());
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
            routing: Routing::new(library),
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
                plan.input.clone(),
                plan.context.needs_context,
            )),
            _ => None,
        });
        assert_eq!(
            start,
            Some(("prompt".into(), json!({ "text": "hi thanks" }), Some(false)))
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
}
