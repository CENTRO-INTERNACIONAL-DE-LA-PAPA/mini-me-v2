## MODIFIED Requirements

### Requirement: History entries
Each history entry SHALL be `{ author, name, content, files, complete }`:
- `author` is `user` or `mini_me`;
- `name` is "You", the Mini-Me's name, or "Mini-Me" when it is no longer known;
- `content` is the message text, followed by one line for each of its Interactive Components
  in order, separated by blank lines;
- `files` lists the names of its attached and referenced Assets;
- `complete` is `false` for a reply that was stopped, failed or is still streaming.

A component's line SHALL be `[<kind> "<title>" from <source file>, id <component ID>]`,
leaving out the title when the component has none and `from <source file>` when it has no
source file. A component's `text` and preview SHALL NOT be in the history.

Notes from Mini-Me itself (author `system`) SHALL be left out.

#### Scenario: Stopped reply
- **WHEN** an earlier reply was stopped after "The main cause"
- **THEN** its entry has content "The main cause" and `complete: false`

#### Scenario: Routing note
- **WHEN** an earlier message got Mini-Me's note asking to mention a Mini-Me
- **THEN** the note is not in the history

#### Scenario: Reply with a component
- **WHEN** an earlier Plotter reply has the text "Here is the chart." and the chart "Yield by
  variety" drawn from `field-trial.csv`
- **THEN** its entry's content is "Here is the chart." followed by
  `[chart "Yield by variety" from field-trial.csv, id 0196…]`, so a follow-up such as
  "make that chart a bar chart" can read it by ID

#### Scenario: Component without a source file
- **WHEN** an earlier reply holds an approval
- **THEN** its line is `[approval, id 0196…]`

### Requirement: Results request
During a Trait call, the sidecar SHALL be able to send `core.request` with method
`conversation.results` and empty params. The core SHALL answer `{ assets, components }`
for the call's Conversation, each newest first and at most 50:
- `assets`: `{ id, name, media_type, size_bytes, message_id, current, hidden }`;
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

#### Scenario: Message references
- **WHEN** the call's user message says "plot the last table" and references no file
- **THEN** every component is listed without a `current` flag, newest first, so the model
  finds the table the words describe

### Requirement: Results are the Conversation's own
`conversation.results` SHALL list the Assets attached to or referenced by the
Conversation's messages, the source files of its components, hidden or not, and the
components of its replies, including the call's own reply so far. Nothing from other Conversations or Projects SHALL be
listed, and no file path SHALL be sent.

#### Scenario: Other Conversation
- **WHEN** a file was attached only in another Conversation of the Project
- **THEN** it is not listed

#### Scenario: Hidden source file
- **WHEN** Researcher's reply showed papers whose source is a hidden JSON file
- **THEN** the `paper-sources` component is listed, and its hidden file is among the assets

### Requirement: Reading a component
During a Trait call, `core.request` with method `component.read`, params `{ component_id }`,
SHALL return `{ kind, version, text, source_asset_id }` of that component, without its
preview. Only components of the call's Conversation are readable; any other ID SHALL fail with `not_found`. `source_asset_id`
SHALL be `null` when the component has no source file or its file no longer exists.

#### Scenario: Full table data
- **WHEN** a call reads an earlier `table` component shown from `field-trial-cleaned.csv`
- **THEN** it gets the table's kind and text, and the ID of `field-trial-cleaned.csv`, whose
  rows it reads with `asset.read`; the component's rows are not returned

#### Scenario: Preview of a file
- **WHEN** a call reads a preview of 500 of 12,340 rows of `field-trial-cleaned.csv`
- **THEN** `source_asset_id` is the ID of `field-trial-cleaned.csv`

#### Scenario: Table without a file
- **WHEN** a call reads Profiler's column table
- **THEN** `source_asset_id` is the ID of the hidden file holding its rows

#### Scenario: Component of another Conversation
- **WHEN** a call asks for a component ID from another Conversation
- **THEN** the request fails with `not_found`

#### Scenario: Papers
- **WHEN** a call reads a `paper-sources` component
- **THEN** `source_asset_id` is the ID of its hidden papers file, which the call reads by ID

#### Scenario: Approval
- **WHEN** a call reads an approval
- **THEN** `source_asset_id` is `null`
