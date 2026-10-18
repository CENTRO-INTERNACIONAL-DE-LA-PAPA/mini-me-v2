# interactive-components Specification

## Purpose

Defines Interactive Components: the hand-coded kinds and their versions, which Traits may
use them, how a Trait adds one to a reply, how components are stored and replayed, and how
the UI shows them below a reply's text.

## Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component data SHALL come only
from the adapters of built-in Traits that list the kind, or, for the `approval` kind, from
the Rust core. Adding a kind SHALL NOT need a change to the event protocol, the link
protocol or the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1 and `approval` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind a built-in Trait lists has a renderer for version 1

#### Scenario: No Trait adds an approval
- **WHEN** a Trait call sends `component.add` with kind `approval`
- **THEN** the request fails with `component_not_allowed`

### Requirement: Adding a component to a reply
During a call, the sidecar SHALL be able to send `core.request` with method `component.add`
and params `{ kind, version, data, text }`. `data` is a JSON value, and `text` is a
non-empty plain-text alternative. If the reply is still streaming, the core SHALL give the
component a new UUIDv7, persist it, and answer `{ component_id }`.

#### Scenario: Paper list added
- **WHEN** a Find Papers call adds a valid `paper-sources` component
- **THEN** the core answers with a new `component_id`, and the reply shows the component
  below its text

#### Scenario: After the reply ended
- **WHEN** the sidecar sends `component.add` for a call that has ended
- **THEN** the core answers with error code `call_not_active`, and nothing is persisted

### Requirement: Only listed kinds are accepted
The core SHALL reject `component.add` with:
- `component_not_allowed` when the call's Trait does not list the kind;
- `invalid_component` when `text` is empty or `data` serialized is larger than 2 MiB.

A rejected component SHALL NOT be persisted, and the call SHALL continue.

#### Scenario: Kind the Trait doesn't list
- **WHEN** a Find Papers call adds a `theories` component
- **THEN** the request fails with `component_not_allowed`, and the reply keeps streaming

#### Scenario: Empty text
- **WHEN** a Find Papers call adds `paper-sources` with an empty `text`
- **THEN** the request fails with `invalid_component`, and nothing is persisted

### Requirement: Component event
A component SHALL be persisted as the event `component.added`, payload `{ message_id,
component: { id, kind, version, data, text } }`. It SHALL apply only to a streaming reply,
and a message's components SHALL keep the order of their events.

#### Scenario: Replay
- **WHEN** a Conversation is replayed from sequence 1
- **THEN** each reply shows the same components, in the same order, as before

### Requirement: Components appear below a reply's text
The UI SHALL show a message's Interactive Components below its text and above its
attachments, in order, while the reply streams and after it ends. Each component SHALL be
drawn by its kind's renderer for its version, with the app's theme tokens.

#### Scenario: Component while streaming
- **WHEN** a `component.added` event arrives for a streaming reply
- **THEN** the component appears under the text received so far, and the progress line
  stays below it until the reply ends

### Requirement: Unknown kinds fall back to text
When the UI has no renderer for a component's kind and version, or its renderer fails, it
SHALL show the component's `text` instead, and SHALL keep showing the rest of the message.

#### Scenario: Project from a newer version
- **WHEN** a Conversation holds a component whose kind this version of the app doesn't know
- **THEN** that component's place shows its `text`, and the reply's other content is
  unchanged

#### Scenario: Data the renderer can't draw
- **WHEN** a component's data is missing a field its renderer needs and the renderer fails
- **THEN** that component's place shows its `text`

### Requirement: Paper sources component
The data of `paper-sources` version 1 SHALL be `{ papers }`. Each paper has `title`, and optionally
`authors` (names), `year`, `venue`, `url` and `reason`. The UI SHALL show the first five
papers as cards with title, first authors, year and reason. If there are more papers, a
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
The data of `theories` version 1 SHALL be `{ theories, references }`. Each theory has a `name`, an
optional `description` and `statements`. Each statement has its `text` and `evidence`
items, each with `text` and `refs`. Names, descriptions and statement texts are each
`{ plain, technical }`. A `ref` is the 1-based number of an entry in `references`, which
holds `title`, `year` and `url`.

#### Scenario: Evidence cites a paper
- **WHEN** an evidence item has `refs` [2]
- **THEN** it shows "[2]", which points to the second reference listed under the theories

### Requirement: Switching a theory's wording
The UI SHALL show each theory in plain language first. A control on each theory SHALL
switch its name, description and statements between plain and technical wording. A theory
whose `technical` text is missing SHALL show its plain text in both.

#### Scenario: Technical wording
- **WHEN** the user switches the second theory to technical wording
- **THEN** only that theory shows its technical name, description and statements

### Requirement: Table component
The data of `table` version 1 SHALL be `{ columns, rows }` and optionally `title`,
`total_rows` and `source`. Each column has a `name` and a `type` (`number`, `text`, `date`
or `boolean`). Each row is a list with one value per column; a value may be `null`. The UI
SHALL draw a table with a header row, numbers right-aligned in tabular figures, empty cells
for `null`, a scrollable body, and sorting by clicking a column header.

#### Scenario: Sorting
- **WHEN** the user clicks the header of the `yield` column
- **THEN** the rows are sorted by `yield`, and clicking again reverses the order

#### Scenario: Missing values
- **WHEN** a row has `null` for `yield`
- **THEN** that cell is empty, and sorting places it last

### Requirement: Table previews
When a `table` component's `total_rows` is larger than its number of rows, it is a preview
and `source` names the Asset holding the full table. The UI SHALL then say "Showing n of m
rows" and name the source Asset.

#### Scenario: Preview of a large table
- **WHEN** a component holds 500 rows with `total_rows` 12,340 and `source`
  `field-trial-cleaned.csv`
- **THEN** the table shows the 500 rows and "Showing 500 of 12,340 rows", naming
  `field-trial-cleaned.csv`

### Requirement: Approval component
The data of `approval` version 1 SHALL be `{ step_id, prompt }`, and its `text` the prompt.
The UI SHALL show the prompt with Approve and Reject while the component has no answer and
its reply is `paused`. Once answered, it SHALL show "Approved" or "Rejected" instead of the
buttons. A reply stopped before an answer SHALL show neither the buttons nor an answer.

#### Scenario: Waiting
- **WHEN** a paused reply holds an unanswered approval "Design an experiment to test this
  plan's hypothesis?"
- **THEN** the prompt shows with Approve and Reject

#### Scenario: After approving
- **WHEN** the user approves
- **THEN** the buttons are replaced by "Approved", also after the Conversation is reopened

### Requirement: Component answers
An answer to an Interactive Component SHALL be persisted as `component.answered`, payload
`{ message_id, component_id, answer }`, with `answer` a JSON value. It SHALL set the
component's `answer`, and a component SHALL be answered at most once.

#### Scenario: Replay
- **WHEN** a Conversation with an answered approval is replayed from sequence 1
- **THEN** that approval's `answer` is `{ "approved": true }` or `{ "approved": false }`, as
  the user chose
