## MODIFIED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component previews SHALL come only
from a Trait's adapter, through show-a-table, Plot's show-a-chart, write-a-document or the
provider adapter that owns the kind, or, for the `approval`, `hand-off` and `document` kinds,
from the Rust core, which adds a `document` card for a reply that made suggestions. Adding a
kind SHALL NOT need a change to the event protocol, the link protocol or the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1, `approval` version 1, `chart` version 1, `document` version 1, `hand-off`
  version 1 and `dataset-results` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind that a Trait's adapter adds has a renderer for version 1

#### Scenario: No Trait adds an approval
- **WHEN** a Trait call sends `component.add` with kind `approval`
- **THEN** the request fails with `component_not_allowed`

#### Scenario: No Trait adds document edits
- **WHEN** a Trait's model wants to change a document
- **THEN** it calls the suggest tool; no component kind holds edits

#### Scenario: No Trait adds a hand-off
- **WHEN** a Trait call sends `component.add` with kind `hand-off`
- **THEN** the request fails with `component_not_allowed`

### Requirement: Checks on an added component
The core SHALL reject `component.add` from a Trait call with:
- `component_not_allowed` when the kind is `approval` or `hand-off`, which only the core
  creates;
- `invalid_component` when `text` is empty, `preview` serialized is larger than 2 MiB, or
  `source_asset_id` is not an Asset of the call's Project.

The core SHALL NOT check the kind against the Trait. A rejected component SHALL NOT be
persisted, and the call SHALL continue.

#### Scenario: Any kind from a Trait
- **WHEN** a Find Papers call adds a `theories` component
- **THEN** the core accepts it; which kinds a Trait shows is up to its adapter

#### Scenario: Empty text
- **WHEN** a Find Papers call adds `paper-sources` with an empty `text`
- **THEN** the request fails with `invalid_component`, and nothing is persisted

#### Scenario: Unknown source file
- **WHEN** a call adds a `table` whose `source_asset_id` is not an Asset of its Project
- **THEN** the request fails with `invalid_component`, and nothing is persisted

### Requirement: A component's data lives in its source file
A component's `preview` SHALL be only what the UI shows, kept so the reply shows the same
component after its source file changes. Every `table` and `chart` component, and every
`paper-sources`, `theories` and `dataset-results` component, SHALL have a `source_asset_id`,
except when its source file could not be saved (larger than 32 MiB); the full data SHALL be
read from that file. Components the core creates, and `document` components, SHALL have none.

#### Scenario: File edited after the reply
- **WHEN** Curator showed 80 rows of `field-trial-cleaned.csv` and the user later adds rows to
  the file in Excel
- **THEN** Curator's reply still shows the 80 rows, and a Trait that reads the table's source
  file gets the edited rows

## REMOVED Requirements

### Requirement: Suggestion component
**Reason**: Suggestions are no longer components; they are shown and answered in the document's
source.
**Migration**: See `document-suggestions`.

### Requirement: Document edits component
**Reason**: A reply that made suggestions shows the plain `document` card.
**Migration**: None.
