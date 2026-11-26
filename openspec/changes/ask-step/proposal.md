# Proposal

## Why

A Workflow can stop to ask the user only yes or no, through an approval Step. Some Mini-Mes
need more before they can work well. Diagnostic Analytics, the next data Mini-Me (#62), has
to know the outcome, the possible drivers and confounders, and whether the user wants an
association or a cause, before it chooses a method. v1 asked through a form that the
researcher filled in. This change lets an approval Step ask for a written answer and pass it
to the Steps after it, with the questions either written by the Workflow's author or by the AI
model from the user's message.

## What Changes

- An approval Step may ask for a **written answer**. Its component then shows the questions,
  a text box, **Skip** and **Send**:
  - **Send** resumes the run, and the text becomes the Step's output, which later Steps
    receive like any earlier output.
  - **Skip** resumes the run with no output; it does not end the reply.
- A written-answer approval may let the **AI model write the questions**. Its prompt is then
  an instruction, and before pausing the run asks the model chosen in Settings to write the
  questions from the user's message and the earlier outputs. By default the prompt is shown as
  written.
- The answer is stored with the approval and shown in the reply's Workflow progress, also
  after the Conversation is reopened.
- Data Traits give their AI model the earlier Steps' outputs as well as the user's message,
  so an answer reaches them.
- The Workflow editor's approval inspector gets two switches: "Ask for a written answer" and
  "AI model writes the questions".
- Approvals without these settings behave as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflows`: an approval Step may ask for a written answer and let the model write its
  questions; Send and Skip resume the run; the answer is the Step's output.
- `interactive-components`: the `approval` component's preview and answer gain the questions
  and the written answer, and the component shows a text box with Skip and Send.
- `workflow-editor`: the inspector edits an approval's two new settings.
- `data-traits`: what the model is given includes the earlier Steps' outputs.
- `trait-execution`: `run.paused` carries the model's questions, and the resume request carries
  the written answer.

## Out of scope

- The Diagnostic Analytics Mini-Me and its Traits: the `diagnostic-traits` change, which will
  use this.
- Answering a waiting approval by typing in the composer (#29).
- A tool that lets a Trait's model ask the user in the middle of its call.
- Forms with fixed fields.

## Impact

- **Rust core:** the approval Step's definition and library check (`library.rs`), pausing and
  answering a run (`runs.rs`, `conversations.rs`, `ipc.rs`), the resume frame (`protocol.rs`).
- **Sidecar:** the approval node, which can ask the model for the questions before pausing and
  takes the answer as its output on resume (`workflow/graph.py`, `workflow/decide.py`); data
  Traits' `choose()`.
- **UI:** the approval component, its answer in the Workflow progress card, the Workflow
  editor's inspector, and the protocol types.
- **Protocol:** the payloads of `run.paused`, the resume request and `component.answered`
  gain optional fields; no new event type.
- **No new external service, credential or cost.** A model-written approval makes one model
  call on the user's own provider.
