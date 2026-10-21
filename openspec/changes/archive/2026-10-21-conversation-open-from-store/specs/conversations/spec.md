# Spec Delta

## MODIFIED Requirements

### Requirement: Message model
A message SHALL have an `id` (UUIDv7), an `author` (`kind` of `user`, `mini_me` or `system`,
and an `id`), `content` (text), a `status` (`streaming`, `paused`, `complete`, `failed` or
`cancelled`), an optional `reply_to` message ID, a list of attachments (each an Asset
reference: `id`, `name`, `media_type`, `size_bytes`), a list of Text Components, a list
of Interactive Components (each `{ id, kind, version, data, text, answer }`, with `answer`
`null` until answered) and a list of Steps (each `{ step_id, type, name, output, done }`).
A message's state SHALL be fully determined by the events of its Conversation.

#### Scenario: Rebuilding from events
- **WHEN** the app replays a Conversation's events from sequence 1
- **THEN** every message's content, status, attachments, Text Components, Interactive
  Components, Steps and reactions match what the user saw before

#### Scenario: Opening from stored messages matches a replay
- **WHEN** the app opens a Conversation from its stored messages
- **THEN** every message's content, status, attachments, Text Components, Interactive
  Components, Steps, reactions, failure, Jev's answer and progress equal what replaying the
  Conversation's events from sequence 1 gives

#### Scenario: Message without components
- **WHEN** a message is created
- **THEN** its list of Interactive Components is empty until `component.added` events add
  to it

#### Scenario: Steps of a reply
- **WHEN** a reply receives `step.started` for *Scout*, then `step.completed` for it
- **THEN** its Steps hold one entry for *Scout*, done, with *Scout*'s output
