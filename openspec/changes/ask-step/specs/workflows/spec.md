# Spec Delta

## ADDED Requirements

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
- **WHEN** the model's call for the questions fails or answers with no text
- **THEN** the reply fails with code `questions_failed` and the message "I couldn't write my
  questions; send your message again."

### Requirement: Written-answer approvals are checked
The Rust core SHALL refuse, as it refuses other broken Workflows, an approval Step whose
`answer` is set to anything but `"text"`, or whose `questions_by` is set to anything but
`"model"` or is set without `answer` `"text"`.

#### Scenario: Model questions without a written answer
- **WHEN** an approval Step has `questions_by` `"model"` and no `answer`
- **THEN** the library is refused, naming the Mini-Me and the Step ID

## MODIFIED Requirements

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

### Requirement: Step outputs
Each Step SHALL have an output, used by later Steps and by the reply:
- a Trait Step's output is the text its call wrote;
- a condition's output is that of the last Step with an output in the chosen branch, and
  none when that branch has no Steps;
- a loop's output is that of its last iteration;
- a parallel Step's output is each branch's output under a `## <label>` line, in branch
  order;
- an approval's output is the written answer sent to it, and none for a yes-or-no approval or
  a skipped one.

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
- **THEN** *Plan*'s call receives that text as the approval Step's output among the earlier
  outputs

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
  sent text as that Step's output. Send needs text that is not blank.
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
- **THEN** the reply is `streaming` again, and the next Step receives that text among the
  earlier outputs

#### Scenario: Skipped
- **WHEN** the user skips a written-answer approval
- **THEN** the reply is `streaming` again, the next Step runs, and the approval has no output
