# Spec Delta

## ADDED Requirements

### Requirement: A multi-Step reply ends with a summary
When a Workflow with more than one Step ends, other than by a rejected approval, the run SHALL
ask the AI model chosen in Settings for a summary of what its Steps found, from the user's
message and the Steps' outputs, and SHALL stream it into the reply as the reply's text. The
summary SHALL restate only what the outputs say, and SHALL NOT recommend next steps.

#### Scenario: Exploratory Data Analysis summary
- **WHEN** an Exploratory Data Analysis run ends after *Detect Outliers*
- **THEN** the reply's text streams a summary of the profile, the columns, the correlations
  and the outliers, written from those Steps' outputs

#### Scenario: Rejected approval
- **WHEN** the user rejects Investigator's approval
- **THEN** the reply completes with the Workflow's output so far, and no summary is written

### Requirement: A reply without a summary
With no AI model set, or when the summary call fails or writes nothing, the reply's text SHALL
be the last top-level Step's output, and the reply SHALL NOT fail for it.

#### Scenario: Summary fails
- **WHEN** the provider refuses the summary call
- **THEN** the reply completes with the last Step's output as its text


### Requirement: Selecting a Step shows only that Step
Selecting a Step in a reply's Workflow progress SHALL replace the reply's text and its own
components with the selected Step run's output and components, until the Step is selected
again or another Step is selected. The reply's attachments, reactions and notes SHALL stay.

#### Scenario: Looking at one Step
- **WHEN** the user selects *Describe Variables* in an ended Exploratory Data Analysis reply
- **THEN** the reply shows *Describe Variables*' text, tables and charts, and not the summary
  or the other Steps' charts

#### Scenario: Back to the summary
- **WHEN** the user selects *Describe Variables* again
- **THEN** the reply shows the summary and its own components again

## MODIFIED Requirements

### Requirement: Steps of a Workflow
A Workflow SHALL be a non-empty list of Steps, each with an `id` unique within the Workflow
and a `type`:
- `trait`: `{ trait, show_results? }`, a Trait ID from the library, and `show_results` `true`
  for a Step whose results show in the reply;
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

### Requirement: The reply's text is the Workflow's output
The reply's text of a one-Step Workflow SHALL be its Step's output, streamed. The reply's text
of a Workflow with more than one Step SHALL be the run's summary (see "A multi-Step reply ends
with a summary"); when there is none, it SHALL be the output of the last top-level Step with an
output, written when the run ends. No Step's text streams into the reply of a multi-Step
Workflow.

#### Scenario: One-Step Workflow streams
- **WHEN** Scribe's one-Step Workflow runs
- **THEN** the summary streams into the reply as before

#### Scenario: Multi-Step reply
- **WHEN** Investigator's run ends
- **THEN** the reply's text is the summary of its run, and each Step's own text is in its
  Step

#### Scenario: Earlier Step doesn't stream
- **WHEN** Investigator's *Plan* Step runs before its loop
- **THEN** its text does not appear in the reply's text, and the reply's progress card shows
  *Plan* running

### Requirement: Step events
The Rust core SHALL persist, for each Step that a run starts:
- `step.started`: `{ message_id, step_id, type, name, show_results }`, where `name` is the
  Trait's name for a Trait Step, or the Step's `label` or its type name, and `show_results` is
  the Step's setting, `false` for other Steps;
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
with an output or with Interactive Components, and a done written-answer approval, SHALL be
selectable. While one is selected, the reply SHALL show in place of its text and of its
own components only that Step run's output and components (an approval's questions and
answer), and selecting it again or another Step SHALL change or clear that. A one-Step reply SHALL show no card.

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
