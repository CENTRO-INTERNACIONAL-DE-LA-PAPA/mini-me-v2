## MODIFIED Requirements

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

## ADDED Requirements

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
