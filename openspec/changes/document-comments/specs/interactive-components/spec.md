# Spec Delta

## MODIFIED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component data SHALL come only
from a Trait's adapter through the kind's show tool, or, for the `approval` kind, from the
Rust core; the Rust core SHALL complete a `suggestion`'s data with the passage it is based on.
Adding a kind SHALL NOT need a change to the event protocol, the link protocol or the Project
database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1, `approval` version 1, `chart` version 1, `document` version 1 and `suggestion`
  version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind that a show tool adds has a renderer for version 1

#### Scenario: No Trait adds an approval
- **WHEN** a Trait call sends `component.add` with kind `approval`
- **THEN** the request fails with `component_not_allowed`

## ADDED Requirements

### Requirement: Suggestion component
A `suggestion` component (version 1) SHALL hold `{ document_id, base, text }`: the document, the
passage text the suggestion is based on, and the suggested text. In a thread's messages it SHALL
show the suggested text and, once answered, its decision: accepted, rejected or dismissed. A
pending one SHALL be shown first in the thread view instead, as the comment threads describe.
Its `text` for history SHALL be the suggested text.

#### Scenario: Answered suggestion
- **WHEN** a suggestion has been accepted
- **THEN** it shows the suggested text, marked as accepted, without buttons or Mini-Me colour
