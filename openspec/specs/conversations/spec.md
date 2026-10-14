# conversations Specification

## Purpose

Defines Conversations inside a Project: the message model, the events that create and update
messages, how replies stream into a single message, cancellation, reactions and Text
Components.

## Requirements

### Requirement: Create and list Conversations
The user SHALL be able to create a Conversation inside an open Project. A new Conversation
SHALL be titled "New conversation". The Conversation list SHALL be ordered by most recent
activity first.

#### Scenario: Create a Conversation
- **WHEN** the user creates a Conversation in a Project
- **THEN** it appears at the top of that Project's Conversation list, titled
  "New conversation", with no messages

#### Scenario: Activity reorders the list
- **WHEN** a message is sent in an older Conversation
- **THEN** that Conversation moves to the top of the list

### Requirement: Message model
A message SHALL have an `id` (UUIDv7), an `author` (`kind` of `user`, `mini_me` or `system`,
and an `id`), `content` (text), a `status` (`streaming`, `complete`, `failed` or
`cancelled`), an optional `reply_to` message ID, a list of attachments (each an Asset
reference: `id`, `name`, `media_type`, `size_bytes`) and a list of Text Components. A message's state SHALL be fully determined by the events of its
Conversation.

#### Scenario: Rebuilding from events
- **WHEN** the app replays a Conversation's events from sequence 1
- **THEN** every message's content, status, attachments, Text Components and reactions match
  what the user saw before

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

### Requirement: Messages cannot be edited
The app SHALL NOT offer any way to edit or delete a sent message. To correct a message the
user stops the reply in progress and sends a new message.

#### Scenario: No edit action
- **WHEN** the user views any sent message
- **THEN** no edit or delete action is available for it

### Requirement: Replies stream into a single message
Each reply to a user message SHALL be one message, created with status `streaming` and
`reply_to` set to the user message, then updated by `message.delta` events and finished by
exactly one of `message.completed`, `message.failed` or `message.cancelled`. Files produced
for the reply SHALL be added to that same message with `attachment.added`.

#### Scenario: Streaming reply
- **WHEN** a reply is produced for a user message
- **THEN** the UI shows a single reply message whose text grows as deltas arrive
- **AND** the message shows as complete when `message.completed` arrives

#### Scenario: No further updates after a final event
- **WHEN** a reply has received `message.completed`, `message.failed` or `message.cancelled`
- **THEN** no further `message.delta` or final event is persisted for it

### Requirement: One reply at a time
While a reply in a Conversation is `streaming`, sending another message in that Conversation
SHALL be rejected, and the UI SHALL offer to stop the reply instead.

#### Scenario: Sending during a reply
- **WHEN** a reply is streaming and the user tries to send another message
- **THEN** the message is not sent and the user can stop the reply

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

### Requirement: Interrupted replies are marked failed
When a Project is opened, any reply still `streaming` from a previous session SHALL be ended
with a `message.failed` event whose error code is `interrupted`.

#### Scenario: App closed during a reply
- **WHEN** the app is closed while a reply is streaming and the Project is opened again
- **THEN** that reply shows as failed with the text received before closing

### Requirement: Reactions
The user SHALL be able to add and remove emoji reactions on any message. Reactions SHALL use
`reaction.added` and `reaction.removed` events with payload
`{ message_id, emoji, by: { kind, id } }`. The same author SHALL have at most one reaction
with a given emoji on a given message.

#### Scenario: Toggle a reaction
- **WHEN** the user adds 👍 to a message and then removes it
- **THEN** a `reaction.added` and then a `reaction.removed` event are persisted and the
  message shows no 👍 reaction

#### Scenario: Duplicate reaction
- **WHEN** the user adds 👍 to a message that already has their 👍
- **THEN** no new event is persisted

### Requirement: Text Components reference Assets
A message's Text Components SHALL each be `{ kind, id, label, start, end }`, where `kind` is
`asset`, `id` is an Asset ID in the same Project, `label` is the text shown and `start`/`end`
are the positions of the reference within the message content. Messages with unknown
`kind`s, unknown Asset IDs or positions outside the content SHALL be rejected.

#### Scenario: Referencing an Asset with #
- **WHEN** the user types `#`, picks an Asset from the Project and sends the message
- **THEN** the sent message shows the reference as a chip and carries the Asset's ID

#### Scenario: Reference to a missing Asset
- **WHEN** a message is sent with a Text Component whose Asset ID does not exist in the
  Project
- **THEN** the message is rejected and nothing is persisted

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
