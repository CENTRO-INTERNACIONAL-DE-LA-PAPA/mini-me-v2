## MODIFIED Requirements

### Requirement: Text Components reference Assets
A message's Text Components SHALL each be `{ kind, id, label, start, end }`, where `kind` is
`asset`, `mini_me` or `component`, `id` is an Asset ID in the same Project, a Mini-Me ID or
the ID of a `table` or `chart` Interactive Component in the same Conversation, `label` is
the text shown and `start`/`end` are the positions of the reference within the message
content. Messages with unknown `kind`s, unknown Asset, Mini-Me or component IDs, or positions
outside the content SHALL be rejected. The `message.created` event carries these Text
Components in its `message` payload.

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

#### Scenario: Referencing a table with $
- **WHEN** the user references the table `field-trial-cleaned` and sends the message
- **THEN** the sent message carries a `component` Text Component with the table component's
  ID

#### Scenario: Component of another Conversation
- **WHEN** a message is sent with a `component` Text Component whose ID is a table component
  of another Conversation
- **THEN** the message is rejected and nothing is persisted
