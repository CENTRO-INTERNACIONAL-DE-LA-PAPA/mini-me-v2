# Spec Delta

## ADDED Requirements

### Requirement: Results request
During a Trait call, the sidecar SHALL be able to send `core.request` with method
`conversation.results` and empty params. The core SHALL answer `{ assets, components }`
for the call's Conversation, each newest first and at most 50:
- `assets`: `{ id, name, media_type, size_bytes, message_id, current }`;
- `components`: `{ id, kind, version, message_id, author }`.

`current` is `true` for the Assets of the call's user message.

#### Scenario: Earlier table and file
- **WHEN** an earlier Curator reply attached `field-trial-cleaned.csv` and a `table`
  component, and the user now asks Assistant about "the last table"
- **THEN** `conversation.results` lists that component first among the components, with
  author "Curator", and the Asset among the assets with `current: false`

#### Scenario: Message files
- **WHEN** the call's user message references `#notes.txt`
- **THEN** `notes.txt` is listed with `current: true`

### Requirement: Results are the Conversation's own
`conversation.results` SHALL list the Assets attached to or referenced by the
Conversation's messages and the components of its replies, including the call's own reply
so far. Nothing from other Conversations or Projects SHALL be listed, and no file path SHALL
be sent.

#### Scenario: Other Conversation
- **WHEN** a file was attached only in another Conversation of the Project
- **THEN** it is not listed

### Requirement: Reading a component
During a Trait call, `core.request` with method `component.read`, params `{ component_id }`,
SHALL return `{ kind, version, data, text }` of that component. Only components of the
call's Conversation are readable; any other ID SHALL fail with `not_found`.

#### Scenario: Full table data
- **WHEN** a call reads an earlier `table` component of its Conversation
- **THEN** it gets all of the component's rows, not only the 20 rows of its text

#### Scenario: Component of another Conversation
- **WHEN** a call asks for a component ID from another Conversation
- **THEN** the request fails with `not_found`
