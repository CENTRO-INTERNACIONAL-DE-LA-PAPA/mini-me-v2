## MODIFIED Requirements

### Requirement: Results request
During a Trait call, the sidecar SHALL be able to send `core.request` with method
`conversation.results` and empty params. The core SHALL answer `{ assets, components }`
for the call's Conversation, each newest first and at most 50:
- `assets`: `{ id, name, media_type, size_bytes, message_id, current }`;
- `components`: `{ id, kind, version, message_id, author, current }`.

`current` is `true` for the Assets of the call's user message, and for the components that
message references with `$`.

#### Scenario: Earlier table and file
- **WHEN** an earlier Curator reply attached `field-trial-cleaned.csv` and a `table`
  component, and the user now asks Assistant about "the last table"
- **THEN** `conversation.results` lists that component first among the components, with
  author "Curator", and the Asset among the assets with `current: false`

#### Scenario: Message files
- **WHEN** the call's user message references `#notes.txt`
- **THEN** `notes.txt` is listed with `current: true`

#### Scenario: Message references
- **WHEN** the call's user message references `$field-trial-cleaned`
- **THEN** that table component is listed with `current: true`, and other components with
  `current: false`

### Requirement: Reading a component
During a Trait call, `core.request` with method `component.read`, params `{ component_id }`,
SHALL return `{ kind, version, data, text, source_asset_id }` of that component. Only
components of the call's Conversation are readable; any other ID SHALL fail with
`not_found`. `source_asset_id` SHALL be a table's `source_id` when that is an Asset of the
Project, and `null` otherwise.

#### Scenario: Full table data
- **WHEN** a call reads an earlier `table` component of its Conversation
- **THEN** it gets all of the component's rows, not only the 20 rows of its text

#### Scenario: Component of another Conversation
- **WHEN** a call asks for a component ID from another Conversation
- **THEN** the request fails with `not_found`

#### Scenario: Preview of a file
- **WHEN** a call reads a preview whose `source_id` is the Asset of `field-trial-cleaned.csv`
- **THEN** `source_asset_id` is that Asset's ID

#### Scenario: Table without a file
- **WHEN** a call reads a table that has no `source_id`
- **THEN** `source_asset_id` is `null`
