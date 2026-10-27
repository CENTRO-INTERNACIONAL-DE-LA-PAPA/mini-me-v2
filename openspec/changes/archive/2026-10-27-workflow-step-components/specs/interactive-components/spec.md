## MODIFIED Requirements

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
The UI SHALL show a message's Interactive Components below its text and above its
attachments, in order, while the reply streams and after it ends. Each component SHALL be
drawn by its kind's renderer for its version, with the app's theme tokens. Once a reply has
ended, it SHALL show only the components without a `step_index` and those of the last Trait
Step run in its started Steps; the others SHALL show with their Step in the Workflow
progress.

#### Scenario: Component while streaming
- **WHEN** a `component.added` event arrives for a streaming reply
- **THEN** the component appears under the text received so far, and the progress line
  stays below it until the reply ends

#### Scenario: Earlier Step's component after the run
- **WHEN** a Workflow's *Find Papers* Step adds paper sources, a later *Summarize* Step
  writes the reply's text, and the reply completes
- **THEN** the paper sources no longer show under the reply's text, and show when the user
  opens *Find Papers* in the reply's Workflow progress card

#### Scenario: Last Step's component stays
- **WHEN** a Workflow's last Trait Step adds a chart and the reply completes
- **THEN** the chart shows under the reply's text

#### Scenario: Earlier Step's component while running
- **WHEN** *Find Papers* has added paper sources and a later Step is still running
- **THEN** the paper sources show under the reply's text
