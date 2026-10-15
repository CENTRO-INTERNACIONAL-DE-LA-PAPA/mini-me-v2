//! Which Mini-Me answers a user message, and whether it also reacts to it. Until Typesafe's
//! Jev is integrated, `stand_in` and `reaction` make the decisions Jev will make.

use std::sync::Arc;

use serde_json::json;
use uuid::Uuid;

use crate::conversations::{self, SendMessageInput};
use crate::error::{AppError, AppResult};
use crate::library::{ECHO_MINI_ME, Library, MiniMe};
use crate::link::{CallModel, CallTrait};
use crate::protocol::{Author, AuthorKind, Message, TextComponentKind};
use crate::store::Project;
use crate::trait_calls::{CallSpec, TraitCalls};

/// Rules checked in order; the first that matches picks the emoji.
const REACTION_RULES: [(&str, &[&str]); 2] = [
    ("🎉", &["congrats", "congratulations", "it worked", "we did it"]),
    ("👍", &["thank", "thanks", "great", "awesome", "perfect"]),
];

/// Validates and persists a user message, then starts the reply of the Mini-Me that answers
/// it and adds that Mini-Me's reaction, if any. A reply that cannot start is logged; the
/// message stays sent.
pub fn send(
    calls: &TraitCalls,
    library: &Library,
    model: Option<CallModel>,
    project: Arc<Project>,
    conversation_id: Uuid,
    input: SendMessageInput,
    user_id: Uuid,
) -> AppResult<Message> {
    check_mentions(&input, library)?;
    let message = conversations::send_message(&project, conversation_id, input, user_id)?;
    let mini_me = answerer(&message, library);
    let Some(trait_def) = library.step_trait(mini_me) else {
        eprintln!("{} has no Trait to run", mini_me.name);
        return Ok(message);
    };
    let author = Author {
        kind: AuthorKind::MiniMe,
        id: mini_me.id.to_string(),
    };
    let spec = CallSpec {
        author: author.clone(),
        adapter: trait_def.adapter.clone(),
        trait_def: CallTrait {
            id: trait_def.id,
            name: trait_def.name.clone(),
            instructions: trait_def.instructions.clone(),
        },
        model,
        input: json!({ "text": input_text(&message) }),
    };
    if let Err(err) = calls.start(Arc::clone(&project), conversation_id, &message, spec) {
        eprintln!("could not start a reply: {err}");
        return Ok(message);
    }
    if let Some(emoji) = reaction(&message.content) {
        if let Err(err) = conversations::add_reaction(&project, message.id, emoji, author) {
            eprintln!("could not add {}'s reaction: {err}", mini_me.name);
        }
    }
    Ok(message)
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

/// The first Mini-Me mentioned in the message, or the stand-in's pick.
fn answerer<'a>(message: &Message, library: &'a Library) -> &'a MiniMe {
    message
        .text_components
        .iter()
        .filter(|c| c.kind == TextComponentKind::MiniMe)
        .min_by_key(|c| c.start)
        .and_then(|c| library.mini_me(c.id))
        .unwrap_or_else(|| stand_in(library))
}

/// Stands in for Jev's choice: always the Echo Mini-Me.
fn stand_in(library: &Library) -> &MiniMe {
    library
        .mini_me(ECHO_MINI_ME)
        .expect("the built-in library has the Echo Mini-Me")
}

/// The emoji the answering Mini-Me reacts with, matching whole words or phrases regardless
/// of case.
fn reaction(content: &str) -> Option<&'static str> {
    let words: Vec<String> = content
        .split(|c: char| !c.is_alphanumeric() && c != '\'')
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .collect();
    let spaced = format!(" {} ", words.join(" "));
    REACTION_RULES
        .iter()
        .find(|(_, keywords)| keywords.iter().any(|k| spaced.contains(&format!(" {k} "))))
        .map(|(emoji, _)| *emoji)
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
    use super::*;
    use crate::link::{AdapterInfo, CoreFrame};
    use crate::protocol::{EventKind, MessageStatus, TextComponent, new_id};
    use crate::secrets::NoSecrets;
    use crate::sidecar::SidecarLog;
    use crate::trait_calls::FrameSink;

    const SCRIBE: Uuid = uuid::uuid!("5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7b01");

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
        }
    }

    #[test]
    fn the_first_mention_answers_and_no_mention_picks_echo() {
        let library = Library::builtin();
        let both = message(
            "@Echo and @Scribe, hello",
            &[("@Scribe", SCRIBE), ("@Echo", ECHO_MINI_ME)],
        );
        assert_eq!(answerer(&both, &library).id, ECHO_MINI_ME);
        let scribe = message("@Scribe summarize this", &[("@Scribe", SCRIBE)]);
        assert_eq!(answerer(&scribe, &library).id, SCRIBE);
        assert_eq!(answerer(&message("late blight spreads", &[]), &library).id, ECHO_MINI_ME);
    }

    #[test]
    fn reactions_follow_the_keyword_rules() {
        assert_eq!(reaction("Thanks, summarize this"), Some("👍"));
        assert_eq!(reaction("That was GREAT!"), Some("👍"));
        assert_eq!(reaction("it worked, thanks!"), Some("🎉"));
        assert_eq!(reaction("Congratulations to the team"), Some("🎉"));
        assert_eq!(reaction("late blight spreads"), None);
        assert_eq!(reaction("a greater yield"), None);
        assert_eq!(reaction("it workedout"), None);
    }

    #[test]
    fn mentions_are_removed_from_the_input() {
        let echo = |content: &str| input_text(&message(content, &[("@Echo", ECHO_MINI_ME)]));
        assert_eq!(echo("@Echo late blight"), "late blight");
        assert_eq!(echo("hi @Echo there"), "hi there");
        assert_eq!(echo("papa 🥔 @Echo ñame"), "papa 🥔 ñame");
        let both = message(
            "@Echo and @Scribe, hello",
            &[("@Echo", ECHO_MINI_ME), ("@Scribe", SCRIBE)],
        );
        assert_eq!(input_text(&both), "and , hello");
    }

    #[test]
    fn unknown_mentions_are_rejected() {
        let library = Library::builtin();
        let mut input = SendMessageInput {
            content: "@Ghost hi".into(),
            attachments: Vec::new(),
            text_components: message("@Ghost hi", &[("@Ghost", new_id())]).text_components,
        };
        assert_eq!(check_mentions(&input, &library).unwrap_err().code, "invalid_input");
        input.text_components[0].id = SCRIBE;
        assert!(check_mentions(&input, &library).is_ok());
    }

    #[derive(Default)]
    struct Recorder(std::sync::Mutex<Vec<CoreFrame>>);

    impl FrameSink for Recorder {
        fn send(&self, frame: &CoreFrame) -> bool {
            self.0.lock().unwrap().push(frame.clone());
            true
        }
    }

    #[test]
    fn a_mention_with_thanks_gets_a_reply_and_a_reaction_from_that_mini_me() {
        let (_dir, project) = crate::projects::test_support::temp_project();
        let project = Arc::new(project);
        let conversation = conversations::create(&project).unwrap().id;
        let calls = TraitCalls::new(
            Box::new(NoSecrets),
            Arc::new(SidecarLog::disabled()),
            crate::trait_calls::CANCEL_TIMEOUT,
        );
        let sink = Arc::new(Recorder::default());
        let echo_adapter = AdapterInfo {
            id: "echo".into(),
            description: String::new(),
            input_schema: json!({}),
            providers: Vec::new(),
        };
        calls.connect(Arc::clone(&sink) as Arc<dyn FrameSink>, vec![echo_adapter]);

        let content = "@Echo hi thanks";
        let input = SendMessageInput {
            content: content.into(),
            attachments: Vec::new(),
            text_components: message(content, &[("@Echo", ECHO_MINI_ME)]).text_components,
        };
        let library = Library::builtin();
        let sent = send(&calls, &library, None, Arc::clone(&project), conversation, input, new_id())
            .unwrap();

        let frames = sink.0.lock().unwrap().clone();
        let [CoreFrame::CallStart { adapter, input, model, .. }] = frames.as_slice() else {
            panic!("expected one call.start, got {frames:?}");
        };
        assert_eq!(adapter, "echo");
        assert_eq!(input, &json!({ "text": "hi thanks" }));
        assert_eq!(model, &None);

        let echo = Author {
            kind: AuthorKind::MiniMe,
            id: ECHO_MINI_ME.to_string(),
        };
        let events = project.lock().events_after(conversation, 0).unwrap();
        let reply_author = events.iter().find_map(|e| match &e.kind {
            EventKind::MessageCreated { message } if message.id != sent.id => {
                Some(message.author.clone())
            }
            _ => None,
        });
        assert_eq!(reply_author, Some(echo.clone()));
        assert!(events.iter().any(|e| matches!(
            &e.kind,
            EventKind::ReactionAdded { message_id, emoji, by }
                if *message_id == sent.id && emoji == "👍" && *by == echo
        )));
    }
}
