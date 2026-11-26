# Spec Delta

## MODIFIED Requirements

### Requirement: Approval component
The preview of `approval` version 1 SHALL be `{ step_id, prompt, answer? }`, with `prompt` the
questions shown and `answer` `"text"` for a written answer, and its `text` the prompt.
The UI SHALL show the component below its reply only while it has no answer and its reply is
`paused`, with the prompt, Approve and Reject, or, for a written answer, the prompt, a text box,
Skip and Send, Send staying disabled while the text box is blank. An answered approval, and one whose reply ended
before an answer, SHALL NOT be shown below the reply; the component and its answer SHALL stay
stored.

#### Scenario: Waiting
- **WHEN** a paused reply holds an unanswered approval "Design an experiment to test this
  plan's hypothesis?"
- **THEN** the prompt shows with Approve and Reject

#### Scenario: After approving
- **WHEN** the user approves
- **THEN** the prompt is no longer shown below the reply, also after the Conversation is
  reopened

#### Scenario: Stopped before an answer
- **WHEN** a reply paused at an approval is stopped
- **THEN** no approval prompt is shown below the reply

#### Scenario: Waiting for a written answer
- **WHEN** a paused reply holds an unanswered written-answer approval "Which column is the
  outcome?"
- **THEN** the question shows with a text box, Skip and Send, and Send is disabled until the
  user types

### Requirement: Component answers
An answer to an Interactive Component SHALL be persisted as `component.answered`, payload
`{ message_id, component_id, answer }`, with `answer` a JSON value. It SHALL set the
component's `answer`, and a component SHALL be answered at most once.

#### Scenario: Replay
- **WHEN** a Conversation with an answered approval is replayed from sequence 1
- **THEN** that approval's `answer` is `{ "approved": true }` or `{ "approved": false }`, as
  the user chose, or for a written answer `{ "text": "<what the user sent>" }` or
  `{ "skipped": true }`
