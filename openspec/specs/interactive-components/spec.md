# interactive-components Specification

## Purpose

Defines Interactive Components: the hand-coded kinds and their versions, which Traits may
use them, how a Trait adds one to a reply, how components are stored and replayed, and how
the UI shows them below a reply's text.

## Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component data SHALL come only
from a Trait's adapter through the kind's show tool, or, for the `approval`, `document-edits`
and `hand-off` kinds, from the Rust core; the Rust core SHALL complete a `suggestion`'s data
with the passage it is based on. Adding a kind SHALL NOT need a change to the event protocol,
the link protocol or the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1, `approval` version 1, `chart` version 1, `document` version 1, `suggestion`
  version 1, `document-edits` version 1 and `hand-off` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind that a show tool adds has a renderer for version 1

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

### Requirement: Component event
A component SHALL be persisted as the event `component.added`, payload `{ message_id,
component: { id, kind, version, data, text, step_index? } }`. It SHALL apply only to a
streaming reply, and a message's components SHALL keep the order of their events.
`step_index` SHALL be the position, counted from 0, in the reply's started Steps of the Step
run whose Trait call added the component. It SHALL be absent for a component that no Trait
Step added.

#### Scenario: Replay
- **WHEN** a Conversation is replayed from sequence 1
- **THEN** each reply shows the same components, in the same order, as before

#### Scenario: Added by a looped Step
- **WHEN** a reply's Steps started so far are *Find Papers*, a loop, *Refute* and *Refute*,
  and the second *Refute* run adds a table
- **THEN** the table's `step_index` is 3

### Requirement: Components appear below a reply's text
The UI SHALL show a message's Interactive Components only once the Step that added each one has
finished, whatever the reply's status, so that text still arriving does not push them down.
Until the reply ends, each SHALL show with its Step in the Workflow progress. Once it has
ended, those without a `step_index` and those of the last Trait Step run SHALL show below its
text and above its attachments, in order; the others SHALL stay with their Step. An approval
SHALL show below the text while the reply waits on it. Each component SHALL be drawn by its
kind's renderer for its version, with the app's theme tokens.

#### Scenario: Component while streaming
- **WHEN** a `component.added` event arrives for a streaming one-Step reply
- **THEN** the component does not show until the reply ends, and then shows under its text

#### Scenario: Waiting on an approval
- **WHEN** a Workflow reply pauses on an approval right after *Find Papers* added paper
  sources
- **THEN** the approval shows under the reply's text, and the paper sources show when the
  user opens *Find Papers* in the Workflow progress card

#### Scenario: Earlier Step's component after the run
- **WHEN** a Workflow's *Find Papers* Step adds paper sources, a later *Summarize* Step
  writes the reply's text, and the reply completes
- **THEN** the paper sources no longer show under the reply's text, and show when the user
  opens *Find Papers* in the reply's Workflow progress card

#### Scenario: Last Step's component stays
- **WHEN** a Workflow's last Trait Step adds a chart and the reply completes
- **THEN** the chart shows under the reply's text

#### Scenario: Earlier Step's component while running
- **WHEN** *Find Papers* has added paper sources and finished, and a later Step is still
  running
- **THEN** the paper sources show when the user opens *Find Papers* in the reply's Workflow
  progress card, and not under the reply's text

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
`total_rows`, `source`, `source_id` and `sheet`. Each column has a `name` and a `type`
(`number`, `text`, `date` or `boolean`). Each row is a list with one value per column; a
value may be `null`. A table shown from a file SHALL name it in `source`, whether or not it
is a preview, with its Asset ID in `source_id` and, for Excel, the sheet in `sheet`. The UI
SHALL draw a table with a header row, numbers right-aligned in tabular figures, empty cells
for `null`, a scrollable body, and sorting by clicking a column header.

#### Scenario: Sorting
- **WHEN** the user clicks the header of the `yield` column
- **THEN** the rows are sorted by `yield`, and clicking again reverses the order

#### Scenario: Missing values
- **WHEN** a row has `null` for `yield`
- **THEN** that cell is empty, and sorting places it last

#### Scenario: Table shown from a file
- **WHEN** a Trait shows a preview of the sheet 2025 of `harvest.xlsx`
- **THEN** the component's data has `source` `harvest.xlsx`, its Asset ID as `source_id`,
  and `sheet` `2025`

#### Scenario: Whole small file
- **WHEN** a Trait shows all 80 rows of `field-trial-cleaned.csv`
- **THEN** the component's data has `source` `field-trial-cleaned.csv` and its `source_id`,
  and the UI shows no "Showing n of m rows" line

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

### Requirement: Component answers
An answer to an Interactive Component SHALL be persisted as `component.answered`, payload
`{ message_id, component_id, answer }`, with `answer` a JSON value. It SHALL set the
component's `answer`, and a component SHALL be answered at most once.

#### Scenario: Replay
- **WHEN** a Conversation with an answered approval is replayed from sequence 1
- **THEN** that approval's `answer` is `{ "approved": true }` or `{ "approved": false }`, as
  the user chose

### Requirement: Chart component
The data of `chart` version 1 SHALL be `{ title, views }`, with one or more views. Each view
has a `type` (`histogram`, `bar`, `line`, `scatter`, `box` or `heatmap`), the columns it
uses with their names and types, and the values its type needs. A view with series lists
them in order. A line or scatter view that was sampled carries `sample: { shown, total }`.

#### Scenario: Chart with two views
- **WHEN** a component holds a histogram view and a box view of `yield`
- **THEN** the UI draws the histogram first and offers the box view

### Requirement: Charts are drawn in a card
The UI SHALL draw a chart in a white bordered card with its title, the axes labelled with
their column names, and a legend when the view has series. When a view was sampled, the
card SHALL say "Sample of n of m points". The chart SHALL use the theme's chart tokens, its
first series SHALL be drawn in the `solid` colour of the Mini-Me that wrote the reply, the
next seven in the theme's series colours, and any further ones in generated colours, so
each series of a view has its own colour.

#### Scenario: Plotter's chart
- **WHEN** Plotter's reply holds a histogram of `yield` with no series
- **THEN** the bars are drawn in Plotter's solid colour on a white bordered card

#### Scenario: Sampled scatter
- **WHEN** a scatter view carries `sample: { shown: 5000, total: 48210 }`
- **THEN** the card says "Sample of 5,000 of 48,210 points"

### Requirement: Hovering shows exact values
When the pointer is over a point, bar, box or cell of a chart, the UI SHALL show a tooltip
with that shape's exact values: its column names and values, and its series when there is
one. Elsewhere on the chart, no tooltip SHALL show.

#### Scenario: Outlier above a box
- **WHEN** the user hovers an outlier dot drawn above a box
- **THEN** the tooltip shows that outlier's value, not the box's statistics

#### Scenario: Hovering a bar
- **WHEN** the user hovers the bar for `variety` "Yungay" in a mean-of-`yield` bar chart
- **THEN** a tooltip shows "Yungay" and its mean `yield`

### Requirement: Showing and hiding series
Clicking a legend entry SHALL hide that series, and clicking it again SHALL show it. At least
one series SHALL stay visible.

#### Scenario: Hiding a treatment
- **WHEN** the user clicks "Control" in the legend of a line chart with three treatments
- **THEN** the "Control" line disappears and the other two stay

#### Scenario: Last series stays
- **WHEN** only one series is visible and the user clicks its legend entry
- **THEN** that series stays visible

### Requirement: Switching views
When a chart has more than one view, the UI SHALL show a toggle with one button per view,
named by its type. Choosing one SHALL draw that view.

#### Scenario: Switching to the box plot
- **WHEN** the user chooses "Box" on a chart whose first view is a histogram
- **THEN** the chart is drawn as the box view

### Requirement: Chart controls are not saved
A chart's controls SHALL only change what the UI shows. They SHALL add no event and send
nothing to the Rust core or the sidecar, so a chart is shown as it first appeared when its
Conversation is opened again.

#### Scenario: Reopening a Conversation
- **WHEN** the user hides a series, leaves the Conversation and opens it again
- **THEN** the chart shows its first view with every series

### Requirement: Checks on an added component
The core SHALL reject `component.add` from a Trait call with:
- `component_not_allowed` when the kind is `approval` or `document-edits`, which only the core
  creates;
- `invalid_component` when `text` is empty or `data` serialized is larger than 2 MiB.

The core SHALL NOT check the kind against the Trait. A rejected component SHALL NOT be
persisted, and the call SHALL continue.

#### Scenario: Any kind from a Trait
- **WHEN** a Find Papers call adds a `theories` component
- **THEN** the core accepts it; which kinds a Trait shows is up to its adapter's tools

#### Scenario: Empty text
- **WHEN** a Find Papers call adds `paper-sources` with an empty `text`
- **THEN** the request fails with `invalid_component`, and nothing is persisted

### Requirement: Featuring a component on the Overview
A chart or table component in a reply SHALL have a "Feature on Overview" button. Featuring it
SHALL make it the Project's featured component, replacing any other, and the button SHALL
show it is featured while it is. Clicking it again SHALL remove it from the Overview. Other
kinds SHALL NOT have the button.

#### Scenario: Featuring a chart
- **WHEN** the user clicks "Feature on Overview" on Plotter's chart
- **THEN** that chart becomes the Project's featured output and its button shows it is
  featured

#### Scenario: Featuring another
- **WHEN** a table is featured and the user features a chart in another reply
- **THEN** the chart replaces the table on the Overview, and the table's button no longer
  shows it as featured

#### Scenario: Paper sources
- **WHEN** a reply holds a paper sources component
- **THEN** it has no "Feature on Overview" button

### Requirement: Document component
The `document` kind, version 1, SHALL hold `{ asset_id, title }` and show a card below the
reply with the document's title, a document icon and an Open button that opens it in the
document view. A card whose document no longer exists SHALL say it was removed.

#### Scenario: Opening from a reply
- **WHEN** the user clicks Open on the document card of Scribe's reply
- **THEN** the document opens in the document view

#### Scenario: Document deleted
- **WHEN** the card's `.qmd` Asset has been removed
- **THEN** the card says the document was removed and offers no Open

### Requirement: Suggestion component
A `suggestion` component (version 1) SHALL hold `{ document_id, base, text }`: the document, the
passage text the suggestion is based on, and the suggested text. In a thread's messages it SHALL
show the suggested text with "Accept and resolve" and Discard while it waits, as the comment
threads describe, and once answered its decision: accepted, discarded or dismissed. Its `text`
for history SHALL be the suggested text.

#### Scenario: Answered suggestion
- **WHEN** a suggestion has been accepted
- **THEN** it shows the suggested text, marked as accepted, without buttons or Mini-Me colour

### Requirement: Document edits component
A `document-edits` component (version 1) SHALL hold `{ asset_id, title, threads }`: the edited
document, its title, and the comment threads the edits opened. Its card SHALL show the title,
how many of its suggestions still wait, and Open, which opens the document with the Comments
sheet showing. A suggestion SHALL count as answered once accepted, discarded or dismissed, or
once its thread is deleted. A card whose document no longer exists SHALL say it was removed.

#### Scenario: Counting down
- **WHEN** Scribe sent three edits to "Trial report" and the user has accepted one
- **THEN** the card in Scribe's reply reads "2 of 3 suggested edits waiting", and once all
  three are answered, "All 3 suggested edits answered"

#### Scenario: Opening the edits
- **WHEN** the user clicks Open on the card
- **THEN** "Trial report" opens with the Comments sheet listing its threads

#### Scenario: In history
- **WHEN** a later message's history includes Scribe's reply
- **THEN** the card appears as "Suggested 3 edits to Trial report"

### Requirement: Hand-off component
A `hand-off` version 1 component SHALL have data `{ mini_me_id, request, file }`, where
`file` is `{ asset_id, name }` or `null`. It SHALL show the Mini-Me's pill, the request, and
the file as a reference chip that opens it. Its `text` SHALL read "Handed to <Mini-Me>:
<request>".

#### Scenario: Hand-off with a file
- **WHEN** a reply holds a `hand-off` to Profiler with request "profile this table" and
  `field-trial.csv`
- **THEN** the reply shows a card with Profiler's pill, "profile this table" and a
  `field-trial.csv` chip
