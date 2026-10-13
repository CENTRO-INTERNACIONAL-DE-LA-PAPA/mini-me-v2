//! Stand-in reply producer that streams the user's text back. It uses only the reply
//! functions in `conversations`, the same API as any other reply producer.

use std::sync::Arc;
use std::time::Duration;

use uuid::Uuid;

use crate::conversations;
use crate::error::AppResult;
use crate::protocol::{Author, AuthorKind};
use crate::store::Project;

pub const CHUNK_DELAY: Duration = Duration::from_millis(60);

pub fn author() -> Author {
    Author {
        kind: AuthorKind::System,
        id: "echo".to_string(),
    }
}

/// Streams `content` back as a reply to `reply_to`, one word per delta. Returns early,
/// without error, when the reply is stopped.
pub fn run(
    project: &Project,
    conversation_id: Uuid,
    reply_to: Uuid,
    content: &str,
    delay: Duration,
) -> AppResult<()> {
    let reply = conversations::start_reply(project, conversation_id, reply_to, author())?;
    for chunk in content.split_inclusive(char::is_whitespace) {
        std::thread::sleep(delay);
        if conversations::append_delta(project, reply, chunk).is_err() {
            return Ok(());
        }
    }
    let _ = conversations::complete_reply(project, reply);
    Ok(())
}

pub fn spawn(project: Arc<Project>, conversation_id: Uuid, reply_to: Uuid, content: String) {
    std::thread::spawn(move || {
        if let Err(err) = run(&project, conversation_id, reply_to, &content, CHUNK_DELAY) {
            eprintln!("echo reply failed: {err}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversations::{SendMessageInput, create, send_message, stop_reply};
    use crate::projects::test_support::temp_project;
    use crate::protocol::{EventKind, new_id};

    fn ask(project: &Project, conversation: Uuid, text: &str) -> Uuid {
        let input = SendMessageInput {
            content: text.to_string(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        send_message(project, conversation, input, new_id()).unwrap().id
    }

    #[test]
    fn reply_streams_then_completes() {
        let (_dir, project) = temp_project();
        let conversation = create(&project).unwrap().id;
        let question = ask(&project, conversation, "late blight spreads");
        run(&project, conversation, question, "late blight spreads", Duration::ZERO).unwrap();

        let events = project.lock().events_after(conversation, 1).unwrap();
        assert!(matches!(events[0].kind, EventKind::MessageCreated { .. }));
        let deltas: String = events
            .iter()
            .filter_map(|e| match &e.kind {
                EventKind::MessageDelta { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(deltas, "late blight spreads");
        match &events.last().unwrap().kind {
            EventKind::MessageCompleted { content, .. } => {
                assert_eq!(content, "late blight spreads")
            }
            other => panic!("expected message.completed, got {other:?}"),
        }
    }

    #[test]
    fn stopped_reply_gets_no_more_deltas() {
        let (_dir, project) = temp_project();
        let project = Arc::new(project);
        let conversation = create(&project).unwrap().id;
        let text = "one two three four five six seven eight";
        let question = ask(&project, conversation, text);

        let worker = {
            let project = Arc::clone(&project);
            std::thread::spawn(move || {
                run(&project, conversation, question, text, Duration::from_millis(20)).unwrap()
            })
        };
        std::thread::sleep(Duration::from_millis(50));
        stop_reply(&project, conversation).unwrap();
        worker.join().unwrap();

        let events = project.lock().events_after(conversation, 1).unwrap();
        let cancelled_at = events
            .iter()
            .position(|e| matches!(e.kind, EventKind::MessageCancelled { .. }))
            .expect("reply was not cancelled");
        assert_eq!(cancelled_at, events.len() - 1);
    }
}
