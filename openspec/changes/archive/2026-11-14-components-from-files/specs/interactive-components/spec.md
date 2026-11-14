## MODIFIED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component previews SHALL come only
from a Trait's adapter, through show-a-table, Plot's show-a-chart or the provider adapter that
owns the kind, or, for the `approval`, `document-edits` and `hand-off` kinds, from the Rust
core; the Rust core SHALL complete a `suggestion`'s preview with the passage it is based on.
Adding a kind SHALL NOT need a change to the event protocol, the link protocol or the Project
database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1, `approval` version 1, `chart` version 1, `document` version 1, `suggestion`
  version 1, `document-edits` version 1, `hand-off` version 1 and `dataset-results` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind that a Trait's adapter adds has a renderer for version 1

#### Scenario: No Trait adds an approval
- **WHEN** a Trait call sends `component.add` with kind `approval`
- **THEN** the request fails with `component_not_allowed`

#### Scenario: No Trait adds document edits
- **WHEN** a Trait call sends `component.add` with kind `document-edits`
- **THEN** the request fails with `component_not_allowed`

#### Scenario: No Trait adds a hand-off
- **WHEN** a Trait call sends `component.add` with kind `hand-off`
- **THEN** the request fails with `component_not_allowed`

### Requirement: Adding a component to a reply
During a call, the sidecar SHALL be able to send `core.request` with method `component.add`
and params `{ kind, version, preview, text, source_asset_id }`. `preview` is a JSON value
holding what the UI shows, `text` is a non-empty plain-text alternative, and
`source_asset_id` is the ID of the Asset holding the component's data, or `null`. If the
reply is still streaming, the core SHALL give the component a new UUIDv7, persist it, and
answer `{ component_id }`.

#### Scenario: Paper list added
- **WHEN** a Find Papers call adds a valid `paper-sources` component with the ID of its hidden
  papers file as `source_asset_id`
- **THEN** the core answers with a new `component_id`, and the reply shows the component
  below its text

#### Scenario: After the reply ended
- **WHEN** the sidecar sends `component.add` for a call that has ended
- **THEN** the core answers with error code `call_not_active`, and nothing is persisted

### Requirement: Component event
A component SHALL be persisted as the event `component.added`, payload `{ message_id,
component: { id, kind, version, preview, text, source_asset_id, step_index? } }`. It SHALL
apply only to a streaming reply, and a message's components SHALL keep the order of their
events. `step_index` SHALL be the position, counted from 0, in the reply's started Steps of the
Step run whose Trait call added the component. It SHALL be absent for a component that no
Trait Step added.

#### Scenario: Replay
- **WHEN** a Conversation is replayed from sequence 1
- **THEN** each reply shows the same components, in the same order, as before

#### Scenario: Added by a looped Step
- **WHEN** a reply's Steps started so far are *Find Papers*, a loop, *Refute* and *Refute*,
  and the second *Refute* run adds a table
- **THEN** the table's `step_index` is 3

### Requirement: Paper sources component
The preview of `paper-sources` version 1 SHALL be `{ papers }`. Each paper has `title`, and
optionally `authors` (names), `year`, `venue`, `url` and `reason`. The UI SHALL show the first
five papers as cards with title, first authors, year and reason. If there are more papers, a
"Show all sources" button SHALL reveal the rest. A card with a `url` SHALL open it in the
default browser when clicked.

#### Scenario: Opening a source
- **WHEN** the user clicks a paper's card
- **THEN** the paper's `url` opens in the system's default browser

#### Scenario: Many sources
- **WHEN** the component holds 18 papers
- **THEN** five cards are shown with "Show all sources", and clicking it shows all 18

#### Scenario: Link that is not a web address
- **WHEN** a paper's `url` does not start with `http://` or `https://`
- **THEN** its card is shown without a link and nothing is opened

### Requirement: Theories component
The preview of `theories` version 1 SHALL be `{ theories, references }`. Each theory has a
`name`, an optional `description` and `statements`. Each statement has its `text` and `evidence`
items, each with `text` and `refs`. Names, descriptions and statement texts are each
`{ plain, technical }`. A `ref` is the 1-based number of an entry in `references`, which
holds `title`, `year` and `url`.

#### Scenario: Evidence cites a paper
- **WHEN** an evidence item has `refs` [2]
- **THEN** it shows "[2]", which points to the second reference listed under the theories

### Requirement: Table component
The preview of `table` version 1 SHALL be `{ columns, rows }` and optionally `title`,
`total_rows`, `source` and `sheet`. Each column has a `name` and a `type` (`number`, `text`,
`date` or `boolean`). Each row is a list with one value per column; a value may be `null`. A
table shown from a file SHALL name that file in `source` and record it as the component's
`source_asset_id`, whether or not it is a preview, and, for Excel, the sheet in `sheet`. The
UI SHALL draw a table with a header row, numbers right-aligned in tabular figures, empty cells
for `null`, a scrollable body, and sorting by clicking a column header.

#### Scenario: Sorting
- **WHEN** the user clicks the header of the `yield` column
- **THEN** the rows are sorted by `yield`, and clicking again reverses the order

#### Scenario: Missing values
- **WHEN** a row has `null` for `yield`
- **THEN** that cell is empty, and sorting places it last

#### Scenario: Table shown from a file
- **WHEN** a Trait shows a preview of the sheet 2025 of `harvest.xlsx`
- **THEN** the component's preview has `source` `harvest.xlsx` and `sheet` `2025`, and its
  `source_asset_id` is the ID of `harvest.xlsx`

#### Scenario: Whole small file
- **WHEN** a Trait shows all 80 rows of `field-trial-cleaned.csv`
- **THEN** the component's preview has `source` `field-trial-cleaned.csv`, its
  `source_asset_id` is that file's ID, and the UI shows no "Showing n of m rows" line

### Requirement: Table previews
When a `table` component's `total_rows` is larger than its number of rows, it is a preview
and its source file holds the full table. The UI SHALL then say "Showing n of m rows" and name
the source file; when the component has a `source_asset_id` that is not hidden and belongs to
a Project, clicking the name SHALL open that file in the system's default app.

#### Scenario: Preview of a large table
- **WHEN** a component holds 500 rows with `total_rows` 12,340 and `source`
  `field-trial-cleaned.csv`
- **THEN** the table shows the 500 rows and "Showing 500 of 12,340 rows", naming
  `field-trial-cleaned.csv`

#### Scenario: Opening the full table
- **WHEN** the user clicks `field-trial-cleaned.csv` in "Showing 500 of 12,340 rows"
- **THEN** `field-trial-cleaned.csv` opens in the system's default app for CSV files

### Requirement: Approval component
The preview of `approval` version 1 SHALL be `{ step_id, prompt }`, and its `text` the prompt.
The UI SHALL show the component below its reply only while it has no answer and its reply is
`paused`, with the prompt, Approve and Reject. An answered approval, and one whose reply ended
before an answer, SHALL NOT be shown below the reply; the component and its answer SHALL stay
stored.

#### Scenario: Waiting
- **WHEN** a paused reply holds an unanswered approval "Design an experiment to test this
  plan's hypothesis?"
- **THEN** the prompt shows with Approve and Reject

#### Scenario: After approving
- **WHEN** the user approves
- **THEN** the prompt is no longer shown below the reply, also after the Conversation is
  reopened

#### Scenario: Stopped before an answer
- **WHEN** a reply paused at an approval is stopped
- **THEN** no approval prompt is shown below the reply

### Requirement: Chart component
The preview of `chart` version 1 SHALL be `{ title, views }`, with one or more views. Each view
has a `type` (`histogram`, `bar`, `line`, `scatter`, `box` or `heatmap`), the columns it
uses with their names and types, and the values its type needs. A view with series lists
them in order. A line or scatter view that was sampled carries `sample: { shown, total }`.

#### Scenario: Chart with two views
- **WHEN** a component holds a histogram view and a box view of `yield`
- **THEN** the UI draws the histogram first and offers the box view

### Requirement: Checks on an added component
The core SHALL reject `component.add` from a Trait call with:
- `component_not_allowed` when the kind is `approval` or `document-edits`, which only the core
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

### Requirement: Hand-off component
A `hand-off` version 1 component SHALL have the preview `{ mini_me_id, request, file }`, where
`file` is `{ asset_id, name }` or `null`. It SHALL show the Mini-Me's pill, the request, and
the file as a reference chip that opens it. Its `text` SHALL read "Handed to <Mini-Me>:
<request>".

#### Scenario: Hand-off with a file
- **WHEN** a reply holds a `hand-off` to Profiler with request "profile this table" and
  `field-trial.csv`
- **THEN** the reply shows a card with Profiler's pill, "profile this table" and a
  `field-trial.csv` chip

## ADDED Requirements

### Requirement: A component's data lives in its source file
A component's `preview` SHALL be only what the UI shows, kept so the reply shows the same
component after its source file changes. Every `table` and `chart` component, and every
`paper-sources`, `theories` and `dataset-results` component, SHALL have a `source_asset_id`,
except when its source file could not be saved (larger than 32 MiB); the full data SHALL be
read from that file. Components the core creates, and `document` and `suggestion` components,
SHALL have none.

#### Scenario: File edited after the reply
- **WHEN** Curator showed 80 rows of `field-trial-cleaned.csv` and the user later adds rows to
  the file in Excel
- **THEN** Curator's reply still shows the 80 rows, and a Trait that reads the table's source
  file gets the edited rows
