# workflows Specification

## Purpose
Defines a Mini-Me's Workflow: its Trait and control Steps, how the Rust core checks it, how
a run executes it, how approvals pause and resume a run, and how a run's progress and
output appear in its reply.

## Requirements

### Requirement: Steps of a Workflow
A Workflow SHALL be a non-empty list of Steps, each with an `id` unique within the Workflow
and a `type`:
- `trait`: `{ trait }`, a Trait ID from the library;
- `approval`: `{ prompt, answer?, questions_by? }`, with `prompt` non-empty text, `answer`
  `"text"` for a written answer, and `questions_by` `"model"` for questions the AI model
  writes;
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

#### Scenario: Approval asking for a written answer
- **WHEN** a Step is `{ "id": "ask", "type": "approval", "prompt": "Which season?", "answer":
  "text" }`
- **THEN** it is an approval Step that asks for a written answer, with "Which season?" shown
  as written

### Requirement: Workflows are checked when the library loads
The Rust core SHALL refuse a library whose Workflows break a rule:
- Step IDs are not unique, or a Trait ID is missing from the library or is a placeholder;
- a Workflow's or loop's list of Steps is empty, or a Workflow has no Trait Step (a branch of
  a condition or parallel Step may have no Steps);
- a condition or parallel Step has fewer than two branches, or two with the same label;
- `max_iterations` is not from 1 to 10;
- a question, prompt or label is empty.

For the built-in library, refusing means the app does not start. For a user-made Mini-Me,
refusing means that Mini-Me is skipped when the library loads, and a save of it is refused.

#### Scenario: Unknown Trait in a nested Step
- **WHEN** a Trait Step inside a parallel branch references a Trait ID that is not in the
  library
- **THEN** the library is refused, naming the Mini-Me and the Step ID

#### Scenario: Loop without a limit
- **WHEN** a loop Step has `max_iterations` 0
- **THEN** the library is refused

#### Scenario: Broken user-made Workflow
- **WHEN** `library.json` holds a Mini-Me whose Workflow has no Steps
- **THEN** the app starts without that Mini-Me, and the Library view names it with the
  problem

#### Scenario: Condition with an empty branch
- **WHEN** a condition Step has the branches "cluster", running *Find Clusters*, and "skip",
  with no Steps
- **THEN** the library is accepted

#### Scenario: Parallel Step with an empty branch
- **WHEN** a parallel Step has the branches "A", running *Scout*, and "B", with no Steps
- **THEN** the library is accepted, and the parallel Step's output is *Scout*'s under
  "## A"

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
- a condition's output is that of the last Step with an output in the chosen branch, and
  none when that branch has no Steps;
- a loop's output is that of its last iteration;
- a parallel Step's output is each branch's output under a `## <label>` line, in branch
  order;
- an approval's output, when a written answer was sent to it, is its questions and that answer,
  as "I asked:", the questions, a blank line, "The user answered:" and the answer; none for a
  yes-or-no approval or a skipped one.

#### Scenario: Parallel output
- **WHEN** a parallel Step's branches "Directions" and "Questions" end with outputs A and B
- **THEN** the parallel Step's output is "## Directions", A, "## Questions" and B, in that
  order

#### Scenario: Empty branch chosen
- **WHEN** a condition's model picks the "skip" branch, which has no Steps
- **THEN** the condition has no output, the run goes on with the Step after the condition, and
  the reply's text is the output of the last top-level Step before it that has one

#### Scenario: Answer passed on
- **WHEN** the user sends "outcome is yield; check rainfall and variety" to a written-answer
  approval, and a *Plan* Step follows it
- **THEN** *Plan*'s call receives the approval's questions and that text as the approval
  Step's output among the earlier outputs

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
than one of the labels, the run SHALL fail with code `invalid_decision`. The model SHALL be made
to answer with a tool call; a model that refuses to be made to call a tool, as some do when they
reason first, SHALL be offered the tool and left to call it, and one that then calls no tool
fails with `invalid_decision`, naming the model.

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
each completed Step as done, and the Step paused at an approval as waiting. A completed
condition or loop Step SHALL show its outcome after its name, and a completed approval Step
its answer, taken from the approval it asked: "approved" or "rejected", or for a written
answer "answered" or "skipped". A done written-answer approval SHALL open, showing its
questions and the answer sent. A done Trait Step
with an output or with Interactive Components SHALL open, showing its output followed by
the components that run of the Step added. A one-Step reply SHALL show no card.

#### Scenario: Run in progress
- **WHEN** Investigator has finished its parallel Step and *Plan* is running
- **THEN** the card shows *Scout*, *Wonder* and the parallel Step as done, and *Plan* as
  running

#### Scenario: Reading an earlier output
- **WHEN** the user opens *Scout* in the card of an ended Investigator reply
- **THEN** the card shows the text *Scout* wrote

#### Scenario: An earlier Step's components
- **WHEN** the user opens *Find Papers* in the card of an ended reply, and *Find Papers*
  added paper sources
- **THEN** the card shows the text *Find Papers* wrote, followed by its paper sources

#### Scenario: An answered approval
- **WHEN** the user approves Investigator's approval and the reply goes on
- **THEN** the card shows the approval Step as done, followed by "Approved", also after
  the Conversation is reopened

#### Scenario: Reading a written answer
- **WHEN** the user opens a done written-answer approval in the card of an ended reply
- **THEN** the card shows its questions followed by the answer the user sent

### Requirement: An approval pauses the run
When a run reaches an approval Step, the core SHALL add an `approval` Interactive Component
to the reply with the Step's questions: its `prompt`, or the questions the AI model wrote when
`questions_by` is `"model"`. It SHALL save the run's state in the Project's
`project.sqlite` and persist `message.paused`. The run SHALL use no sidecar resources while
it is paused. No file outside the Project folder SHALL be written.

#### Scenario: Waiting for the scientist
- **WHEN** Investigator reaches "Design an experiment to test this plan's hypothesis?"
- **THEN** the reply shows the prompt with Approve and Reject, and its status is `paused`

#### Scenario: Paused across a restart
- **WHEN** the app is closed while a reply is paused and the Project is opened again
- **THEN** the reply is still `paused` with its approval, and approving it resumes the run

### Requirement: Answering an approval
The user SHALL answer a paused reply's approval with Approve or Reject, or, for a written
answer, with Send or Skip. The core SHALL persist `component.answered` with `{ approved:
true|false }`, `{ text }` for Send or `{ skipped: true }` for Skip, then delete the saved
state:
- **Approve:** persist `message.resumed` and resume the run after the approval Step, with
  the earlier outputs it had.
- **Send:** persist `message.resumed` and resume the run after the approval Step, with the
  questions and the sent text as that Step's output. Send needs text that is not blank.
- **Skip:** persist `message.resumed` and resume the run after the approval Step, which has
  no output.
- **Reject:** end the reply with `message.completed`, with the Workflow's output so far as
  its text.

An answer that does not fit the approval (a written answer or Skip to a yes-or-no approval,
Approve or Reject to a written-answer one, or blank text) SHALL be refused with
`invalid_answer`, persisting nothing.

#### Scenario: Approved
- **WHEN** the user approves Investigator's approval
- **THEN** the reply is `streaming` again, and *Experiment* runs with the earlier outputs
  of *Scout*, *Wonder*, *Plan* and *Refute*

#### Scenario: Rejected
- **WHEN** the user rejects it
- **THEN** the reply completes with the latest *Plan* output as its text, and *Experiment*
  does not run

#### Scenario: Sent
- **WHEN** the user sends "yield, by rainfall and variety" to a waiting written-answer approval
- **THEN** the reply is `streaming` again, and the next Step receives the questions and that
  text among the earlier outputs

#### Scenario: Skipped
- **WHEN** the user skips a written-answer approval
- **THEN** the reply is `streaming` again, the next Step runs, and the approval has no output

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

### Requirement: The AI model writes an approval's questions
When a written-answer approval has `questions_by` `"model"`, the run SHALL, before pausing,
ask the AI model chosen in Settings to write the questions the Step's `prompt` describes,
from the user's message and the earlier outputs, and the approval SHALL show them. The
`prompt` is then an instruction that the user does not see.

#### Scenario: Questions from the message
- **WHEN** an approval with the prompt "Ask for the outcome and the possible drivers the
  message leaves unclear" and `questions_by` `"model"` is reached after "why did yield drop?
  #trial.csv"
- **THEN** the approval shows questions the model wrote about the outcome and the drivers, and
  not the prompt itself

#### Scenario: No model set
- **WHEN** no AI model is set in Settings and a Mini-Me's Workflow holds an approval with
  `questions_by` `"model"`
- **THEN** the reply fails with `model_not_set` before the run starts

#### Scenario: The model writes no questions
- **WHEN** the model answers the call for the questions with no text
- **THEN** the reply fails with code `questions_failed` and the message "I couldn't write my
  questions; send your message again." A call the provider refuses fails as other model calls
  do.

### Requirement: Written-answer approvals are checked
The Rust core SHALL refuse, as it refuses other broken Workflows, an approval Step whose
`answer` is set to anything but `"text"`, or whose `questions_by` is set to anything but
`"model"` or is set without `answer` `"text"`.

#### Scenario: Model questions without a written answer
- **WHEN** an approval Step has `questions_by` `"model"` and no `answer`
- **THEN** the library is refused, naming the Mini-Me and the Step ID
