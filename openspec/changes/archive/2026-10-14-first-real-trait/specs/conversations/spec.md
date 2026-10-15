# Spec Delta

## MODIFIED Requirements

### Requirement: Reactions
Reactions SHALL use `reaction.added` and `reaction.removed` events with payload
`{ message_id, emoji, by: { kind, id } }`. The same author SHALL have at most one reaction
with a given emoji on a given message. The UI SHALL NOT offer the user any way to add or
remove a reaction; reactions come from Mini-Mes. The UI SHALL show a message's reactions
overlaid on a corner of the message, taking no space in the layout.

#### Scenario: Toggle a reaction
- **WHEN** an author adds 👍 to a message and then removes it
- **THEN** a `reaction.added` and then a `reaction.removed` event are persisted and the
  message shows no 👍 reaction

#### Scenario: Duplicate reaction
- **WHEN** an author adds 👍 to a message that already has their 👍
- **THEN** no new event is persisted

#### Scenario: No reaction controls
- **WHEN** the user views any message
- **THEN** no control to add or remove a reaction is shown

#### Scenario: Reactions do not move the layout
- **WHEN** Scribe adds 👍 to the user's message
- **THEN** the 👍 appears on a corner of that message and no message moves

### Requirement: Text Components reference Assets
A message's Text Components SHALL each be `{ kind, id, label, start, end }`, where `kind` is
`asset` or `mini_me`, `id` is an Asset ID in the same Project or a Mini-Me ID, `label` is the
text shown and `start`/`end` are the positions of the reference within the message content.
Messages with unknown `kind`s, unknown Asset or Mini-Me IDs, or positions outside the content
SHALL be rejected.

#### Scenario: Referencing an Asset with #
- **WHEN** the user types `#`, picks an Asset from the Project and sends the message
- **THEN** the sent message shows the reference as a chip and carries the Asset's ID

#### Scenario: Reference to a missing Asset
- **WHEN** a message is sent with a Text Component whose Asset ID does not exist in the
  Project
- **THEN** the message is rejected and nothing is persisted

#### Scenario: Mentioning a Mini-Me with @
- **WHEN** the user types `@`, picks Scribe and sends the message
- **THEN** the sent message shows "@Scribe" as a chip and carries a `mini_me` Text Component
  with Scribe's ID

#### Scenario: Mention of an unknown Mini-Me
- **WHEN** a message is sent with a `mini_me` Text Component whose ID is not a known Mini-Me
- **THEN** the message is rejected and nothing is persisted

### Requirement: Replies are produced by Trait calls
For each sent user message, the Rust core SHALL pick the answering Mini-Me as routing
defines, start one Trait call for the Trait of that Mini-Me's single Step, and create its
reply with author `{ kind: "mini_me", id: <Mini-Me ID> }`. The call's input is `{ text }`,
the message content with its Mini-Me mentions removed and surrounding whitespace trimmed.

#### Scenario: Echo answers
- **WHEN** the user sends "late blight spreads"
- **THEN** a reply by the Echo Mini-Me streams "late blight spreads" and completes

#### Scenario: Mention text is not part of the input
- **WHEN** the user sends "@Echo late blight spreads"
- **THEN** the Echo Mini-Me's reply is "late blight spreads"
