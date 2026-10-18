# Spec Delta

## Purpose

Defines a Mini-Me's Workflow: its Trait and control Steps, how the Rust core checks it, how
a run executes it, how approvals pause and resume a run, and how a run's progress and
output appear in its reply.

## ADDED Requirements

### Requirement: Steps of a Workflow
A Workflow SHALL be a non-empty list of Steps, each with an `id` unique within the Workflow
and a `type`:
- `trait`: `{ trait }`, a Trait ID from the library;
- `approval`: `{ prompt }`, non-empty text;
- `condition`: `{ question, branches }`;
- `loop`: `{ question, max_iterations, steps }`;
- `parallel`: `{ branches }`.

A branch is `{ label, steps }`. A Step without `type` is a Trait Step.

#### Scenario: One-Step Workflow written as before
- **WHEN** a Mini-Me's Workflow is `{ "steps": [{ "id": "summarize", "trait": "<Summarize ID>" }] }`
- **THEN** it is a Workflow with one Trait Step running *Summarize*

#### Scenario: Nested Steps
- **WHEN** a loop Step's `steps` hold a Trait Step and a condition Step
- **THEN** both are Steps of the Workflow, and their IDs must differ from every other Step's

### Requirement: Workflows are checked when the library loads
The Rust core SHALL refuse a library whose Workflows break a rule:
- Step IDs are not unique, or a Trait ID is missing from the library or is a placeholder;
- a list of Steps is empty, or a Workflow has no Trait Step;
- a condition or parallel Step has fewer than two branches, or two with the same label;
- `max_iterations` is not from 1 to 10;
- a question, prompt or label is empty.

#### Scenario: Unknown Trait in a nested Step
- **WHEN** a Trait Step inside a parallel branch references a Trait ID that is not in the
  library
- **THEN** the library is refused, naming the Mini-Me and the Step ID

#### Scenario: Loop without a limit
- **WHEN** a loop Step has `max_iterations` 0
- **THEN** the library is refused

### Requirement: A run executes Steps in order
A run SHALL execute a Workflow's Steps one after another, each starting after the previous
one finished, and end after its last Step. A Trait Step SHALL run its Trait as one Trait
call, with the user's message as its input, as for a one-Step Workflow. The same Trait in
two Steps, or one Step run twice, SHALL make separate calls.

#### Scenario: Three Steps
- **WHEN** a Workflow is *Scout*, then *Plan*, then *Refute*
- **THEN** *Plan* starts after *Scout* ends, and *Refute* after *Plan* ends

### Requirement: Step outputs
Each Step SHALL have an output, used by later Steps and by the reply:
- a Trait Step's output is the text its call wrote;
- a condition's output is that of the last Step with an output in the chosen branch;
- a loop's output is that of its last iteration;
- a parallel Step's output is each branch's output under a `## <label>` line, in branch
  order;
- an approval has no output.

#### Scenario: Parallel output
- **WHEN** a parallel Step's branches "Directions" and "Questions" end with outputs A and B
- **THEN** the parallel Step's output is "## Directions", A, "## Questions" and B, in that
  order

### Requirement: Trait Steps see earlier outputs
A Trait call in a run SHALL receive the earlier Step outputs, as `{ step_id, name,
output }` with `name` the Trait's name, in the order they finished. This means every Trait
Step that finished before it, except those in parallel branches other than its own. A
Step's own earlier iterations count. The list SHALL keep the newest outputs within 50,000
characters.

#### Scenario: Plan after Scout
- **WHEN** *Plan* runs after a *Scout* Step that wrote "Three directions…"
- **THEN** *Plan*'s call receives one earlier output, named "Scout", with that text

#### Scenario: Parallel branches don't see each other
- **WHEN** *Scout* and *Wonder* run in two branches of the same parallel Step
- **THEN** neither call receives the other's output

### Requirement: The model chooses a branch
A condition SHALL ask the AI model chosen in Settings its `question`, together with the
user's message and the earlier outputs. The model SHALL answer with one branch label from a
fixed list, and only that branch's Steps SHALL run. If the model answers with anything other
than one of the labels, the run SHALL fail with code `invalid_decision`.

#### Scenario: Testable plan
- **WHEN** a condition asks "Does the plan rest on a hypothesis that an experiment could
  test?" with branches "testable" and "not testable", and the model picks "testable"
- **THEN** only the "testable" branch's Steps run

### Requirement: The model decides whether a loop repeats
A loop SHALL run its Steps, then ask the AI model chosen in Settings its `question`, with
the user's message and the earlier outputs, to answer `repeat` or `stop`. It SHALL run its
Steps again on `repeat`, and end on `stop` or after `max_iterations` runs.

#### Scenario: Limit reached
- **WHEN** a loop with `max_iterations` 2 gets `repeat` after each run
- **THEN** its Steps run twice and the run continues with the Step after the loop

#### Scenario: Stopped early
- **WHEN** the model answers `stop` after the first run
- **THEN** the loop's Steps run once

### Requirement: Parallel branches run at the same time
A parallel Step SHALL start all its branches at once and end when every branch has ended.
If a branch fails, the run SHALL fail with that error and cancel the other branches.

#### Scenario: Two branches
- **WHEN** a parallel Step has branches running *Scout* and *Wonder*
- **THEN** both Trait calls are running at the same time, and the next Step starts only
  after both have ended

### Requirement: The reply's text is the Workflow's output
The reply's text SHALL be the output of the last top-level Step with an output. A Trait
Step's text SHALL stream into the reply when it is a final Step, one that no other Step can
follow and that is in no loop or parallel branch. Otherwise the output SHALL be written to
the reply when the run ends.

#### Scenario: One-Step Workflow streams
- **WHEN** Scribe's one-Step Workflow runs
- **THEN** the summary streams into the reply as before

#### Scenario: Earlier Step doesn't stream
- **WHEN** Investigator's *Plan* Step runs before its loop
- **THEN** its text does not appear in the reply's text, and the reply's progress card shows
  *Plan* running

### Requirement: Step events
The Rust core SHALL persist, for each Step that a run starts:
- `step.started`: `{ message_id, step_id, type, name }`, where `name` is the Trait's name for
  a Trait Step, or the Step's `label` or its type name;
- `step.completed`: `{ message_id, step_id, output }`, where `output` is text or `null`, and
  is the chosen branch label for a condition and `repeat` or `stop` for a loop's decision.

They SHALL apply only to a streaming reply.

#### Scenario: Loop iterations
- **WHEN** a loop Step's *Refute* Step runs twice
- **THEN** two `step.started` and two `step.completed` events are persisted for it, in order

### Requirement: Workflow progress in the reply
A reply whose Workflow has more than one Step SHALL show a Workflow progress card above its
text. The card SHALL list the Steps started so far, in order: each running Step as running,
each completed Step as done, and the Step paused at an approval as waiting. Opening a done
Trait Step SHALL show its output. A one-Step reply SHALL show no card.

#### Scenario: Run in progress
- **WHEN** Investigator has finished its parallel Step and *Plan* is running
- **THEN** the card shows *Scout*, *Wonder* and the parallel Step as done, and *Plan* as
  running

#### Scenario: Reading an earlier output
- **WHEN** the user opens *Scout* in the card of an ended Investigator reply
- **THEN** the card shows the text *Scout* wrote

### Requirement: An approval pauses the run
When a run reaches an approval Step, the core SHALL add an `approval` Interactive Component
with the Step's `prompt` to the reply. It SHALL save the run's state in the Project's
`project.sqlite` and persist `message.paused`. The run SHALL use no sidecar resources while
it is paused. No file outside the Project folder SHALL be written.

#### Scenario: Waiting for the scientist
- **WHEN** Investigator reaches "Design an experiment to test this plan's hypothesis?"
- **THEN** the reply shows the prompt with Approve and Reject, and its status is `paused`

#### Scenario: Paused across a restart
- **WHEN** the app is closed while a reply is paused and the Project is opened again
- **THEN** the reply is still `paused` with its approval, and approving it resumes the run

### Requirement: Answering an approval
The user SHALL answer a paused reply's approval with Approve or Reject. The core SHALL
persist `component.answered` with `{ approved: true|false }`, then delete the saved state:
- **Approve:** persist `message.resumed` and resume the run after the approval Step, with
  the earlier outputs it had.
- **Reject:** end the reply with `message.completed`, with the Workflow's output so far as
  its text.

#### Scenario: Approved
- **WHEN** the user approves Investigator's approval
- **THEN** the reply is `streaming` again, and *Experiment* runs with the earlier outputs
  of *Scout*, *Wonder*, *Plan* and *Refute*

#### Scenario: Rejected
- **WHEN** the user rejects it
- **THEN** the reply completes with the latest *Plan* output as its text, and *Experiment*
  does not run

### Requirement: Answers are accepted once
An answer SHALL be refused, persisting nothing:
- with `not_paused` when the reply is not paused at that approval;
- with `sidecar_unavailable` for Approve while the sidecar is not `ready`.

A run that cannot be resumed from its saved state SHALL end the reply with `message.failed`,
code `resume_failed`.

#### Scenario: Double click
- **WHEN** the user answers an approval that was already answered
- **THEN** the second answer is refused with `not_paused`, and the reply is unchanged

#### Scenario: Saved state from an incompatible version
- **WHEN** a paused reply's saved state can't be read by the sidecar
- **THEN** the reply fails with `resume_failed`
