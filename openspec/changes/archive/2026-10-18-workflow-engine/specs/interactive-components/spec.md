# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
