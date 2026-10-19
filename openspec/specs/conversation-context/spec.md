# conversation-context Specification

## Purpose

Defines how a running Trait gets a Conversation's earlier messages: the request it sends,
what the history contains, and how large it may be.

## Requirements

### Requirement: History request
During a call, the sidecar SHALL be able to send `core.request` with method
`conversation.history` and empty params. The core SHALL answer with
`{ messages, truncated }`, where `messages` are the Conversation's messages before the call's
user message, oldest first, and `truncated` is `true` when older messages were left out.

#### Scenario: Follow-up
- **WHEN** the user asks Scribe for a summary, then sends "@Scribe make it shorter"
- **THEN** the second call's history holds the first request and Scribe's summary

#### Scenario: First message
- **WHEN** the call answers the Conversation's first message
- **THEN** `messages` is empty and `truncated` is `false`

### Requirement: History entries
Each history entry SHALL be `{ author, name, content, files, complete }`:
- `author` is `user` or `mini_me`;
- `name` is "You", the Mini-Me's name, or "Mini-Me" when it is no longer known;
- `content` is the message text, followed by the `text` of each of its Interactive
  Components in order, separated by blank lines;
- `files` lists the names of its attached and referenced Assets;
- `complete` is `false` for a reply that was stopped, failed or is still streaming.

Notes from Mini-Me itself (author `system`) SHALL be left out.

#### Scenario: Stopped reply
- **WHEN** an earlier reply was stopped after "The main cause"
- **THEN** its entry has content "The main cause" and `complete: false`

#### Scenario: Routing note
- **WHEN** an earlier message got Mini-Me's note asking to mention a Mini-Me
- **THEN** the note is not in the history

#### Scenario: Reply with a component
- **WHEN** an earlier Researcher reply has the text "Found 12 papers." and a
  `paper-sources` component
- **THEN** its entry's content is "Found 12 papers." followed by the component's `text`, so
  a follow-up such as "summarize the third paper" can refer to it, and the component's text
  counts toward the history size budget

### Requirement: History size budget
The core SHALL fill the history from the newest message backwards and stop before the total
`content` length would exceed 50,000 characters. A single message longer than the whole
budget SHALL end the history at that message.

#### Scenario: Long Conversation
- **WHEN** a Conversation's earlier messages add up to 120,000 characters
- **THEN** the history holds the newest messages within 50,000 characters, and `truncated`
  is `true`

### Requirement: Earlier files by name only
History entries SHALL name their files without their content. A file's content SHALL reach
a model only when a Trait reads it with the read-a-file tool, whether the file belongs to
the current message or an earlier one.

#### Scenario: Earlier file
- **WHEN** a file was referenced three messages ago and the user asks a follow-up without
  referencing it
- **THEN** the history names the file, and its content is not sent unless the model reads
  it

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
