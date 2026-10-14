# Spec Delta

## MODIFIED Requirements

### Requirement: Message events
Message changes SHALL use these event types and payloads:
- `message.created`: `{ message }`, the full message as defined in Message model.
- `message.delta`: `{ message_id, text }`, appended to the message's content.
- `message.progress`: `{ message_id, label, fraction }`, what the reply's producer is doing:
  `label` is short text and `fraction` a number from 0 to 1, or `null` when unknown.
- `message.completed`: `{ message_id, content }`, the final full content.
- `message.failed`: `{ message_id, error: { code, message } }`.
- `message.cancelled`: `{ message_id }`.

#### Scenario: Delta appends text
- **WHEN** a `streaming` message with content "Hel" receives `message.delta` with text "lo"
- **THEN** its content is "Hello"

#### Scenario: Completion sets final content
- **WHEN** a message receives `message.completed`
- **THEN** its status is `complete` and its content equals the payload's `content`

#### Scenario: Progress does not change content
- **WHEN** a `streaming` message receives `message.progress`
- **THEN** its content and status are unchanged

### Requirement: Send a message
The user SHALL be able to send a message with non-empty text, optional attachments and
optional Text Components. Sending SHALL persist a `message.created` event with
`author.kind` `user`, the local user ID and status `complete`. Sending SHALL be refused with
error code `sidecar_unavailable`, persisting nothing, while the sidecar is not `ready`.

#### Scenario: Message appears after sending
- **WHEN** the user sends "What causes late blight?"
- **THEN** the message appears in the Conversation and remains there after a restart

#### Scenario: Empty message
- **WHEN** the user tries to send a message whose text is empty or only whitespace
- **THEN** nothing is sent

#### Scenario: Sidecar not ready
- **WHEN** the sidecar is `starting`, `restarting`, `stopped` or `incompatible`
- **THEN** the composer shows that Mini-Me cannot answer yet, sending is not possible, and a
  send that still reaches the core is refused with `sidecar_unavailable` and persists nothing

### Requirement: Stop a reply
The user SHALL be able to stop a streaming reply. Stopping SHALL end the reply with a
`message.cancelled` event, keeping the text received so far, and SHALL cancel the Trait call
producing it.

#### Scenario: User stops a reply
- **WHEN** the user stops a reply that has received "The main cause"
- **THEN** a `message.cancelled` event is persisted, no more deltas arrive, and the reply
  shows "The main cause" marked as stopped

#### Scenario: Trait call is cancelled
- **WHEN** the user stops a reply
- **THEN** the core sends `call.cancel` for the reply's Trait call

## ADDED Requirements

### Requirement: Replies are produced by Trait calls
For each sent user message, the Rust core SHALL start one Trait call and create its reply
with author `{ kind: "system", id: <Trait ID> }`. Until Mini-Mes exist, every message is
answered by *Echo* with input `{ text }` set to the message content.

#### Scenario: Echo answers
- **WHEN** the user sends "late blight spreads"
- **THEN** a reply by `system`/`echo` streams "late blight spreads" and completes

### Requirement: Trait call outcomes map to message events
The Rust core SHALL persist a reply's events from its Trait call's frames: `call.delta` as
`message.delta`, `call.progress` as `message.progress`, `call.done` as `message.completed`,
`call.error` as `message.failed` with the same `code` and `message`, and `call.cancelled` as
`message.cancelled` when the reply is still streaming.

#### Scenario: Trait error
- **WHEN** the reply's Trait call ends with `call.error` code `trait_error`
- **THEN** the reply ends with `message.failed` carrying code `trait_error` and the text
  received so far

### Requirement: Reply progress is shown
While a reply is `streaming`, the UI SHALL show the label (and the fraction, when not `null`)
of its latest `message.progress` event, and SHALL stop showing it once the reply has ended.

#### Scenario: Progress then completion
- **WHEN** a streaming reply receives `message.progress` with label "Reading field-trial.csv"
  and then `message.completed`
- **THEN** the UI shows "Reading field-trial.csv" while streaming and no progress afterwards

### Requirement: Replies fail when the sidecar stops
When the sidecar stops while replies are streaming, the Rust core SHALL end each of them with
`message.failed`, error code `sidecar_stopped`, keeping the text received so far. The calls
SHALL NOT be retried automatically.

#### Scenario: Sidecar crash during a reply
- **WHEN** the sidecar process is killed while a reply is streaming
- **THEN** the reply shows as failed with code `sidecar_stopped` and its text so far, and
  after the sidecar is ready again the user can send a new message
