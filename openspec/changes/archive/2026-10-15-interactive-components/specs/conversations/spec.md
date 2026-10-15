# Spec Delta

## MODIFIED Requirements

### Requirement: Message model
A message SHALL have an `id` (UUIDv7), an `author` (`kind` of `user`, `mini_me` or `system`,
and an `id`), `content` (text), a `status` (`streaming`, `complete`, `failed` or
`cancelled`), an optional `reply_to` message ID, a list of attachments (each an Asset
reference: `id`, `name`, `media_type`, `size_bytes`), a list of Text Components and a list
of Interactive Components (each `{ id, kind, version, data, text }`). A message's state
SHALL be fully determined by the events of its Conversation.

#### Scenario: Rebuilding from events
- **WHEN** the app replays a Conversation's events from sequence 1
- **THEN** every message's content, status, attachments, Text Components, Interactive
  Components and reactions match what the user saw before

#### Scenario: Message without components
- **WHEN** a message is created
- **THEN** its list of Interactive Components is empty until `component.added` events add
  to it
