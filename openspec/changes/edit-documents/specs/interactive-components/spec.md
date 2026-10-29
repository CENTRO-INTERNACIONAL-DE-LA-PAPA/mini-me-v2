# Spec Delta

## MODIFIED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component data SHALL come only
from a Trait's adapter through the kind's show tool, or, for the `approval` and
`document-edits` kinds, from the Rust core; the Rust core SHALL complete a `suggestion`'s data
with the passage it is based on. Adding a kind SHALL NOT need a change to the event protocol,
the link protocol or the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1, `approval` version 1, `chart` version 1, `document` version 1, `suggestion`
  version 1 and `document-edits` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind that a show tool adds has a renderer for version 1

#### Scenario: No Trait adds an approval
- **WHEN** a Trait call sends `component.add` with kind `approval`
- **THEN** the request fails with `component_not_allowed`

#### Scenario: No Trait adds document edits
- **WHEN** a Trait call sends `component.add` with kind `document-edits`
- **THEN** the request fails with `component_not_allowed`

### Requirement: Suggestion component
A `suggestion` component (version 1) SHALL hold `{ document_id, base, text }`: the document, the
passage text the suggestion is based on, and the suggested text. In a thread's messages it SHALL
show the suggested text with "Accept and resolve" and Discard while it waits, as the comment
threads describe, and once answered its decision: accepted, discarded or dismissed. Its `text`
for history SHALL be the suggested text.

#### Scenario: Answered suggestion
- **WHEN** a suggestion has been accepted
- **THEN** it shows the suggested text, marked as accepted, without buttons or Mini-Me colour

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

## ADDED Requirements

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
