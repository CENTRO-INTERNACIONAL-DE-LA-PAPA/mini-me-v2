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
History entries SHALL name their files without their content. Only the current message's
files are read in full, through `asset.read`.

#### Scenario: Earlier file
- **WHEN** a file was referenced three messages ago and the user asks a follow-up without
  referencing it
- **THEN** the history names the file, and its content is not sent
