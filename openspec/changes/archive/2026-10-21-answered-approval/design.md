# Design

## Context

- When a run reaches an approval Step, the core adds an `approval` component `{ step_id,
  prompt }` to the reply and pauses it (`conversations::pause_reply`). Answering persists
  `component.answered` with `{ approved }` and completes the Step with `output: null`
  (`conversations.rs`, `answer_approval`), so a stored approval Step carries no answer.
- `MessageItem` renders every component of a message. The `approval` renderer
  (`src/components/interactive/approval.tsx`) shows the prompt in every state: with Approve
  and Reject while asking, with "Approved" or "Rejected" once answered, and alone once the
  reply was stopped (`approvalState` returns `closed`).
- `WorkflowProgress` shows ` · <output>` after a done condition or loop Step's name.
- An approval inside a loop pauses once per iteration; each pause adds its own component with
  the same `step_id`, and the Step appears once per run in the message's Steps.

## Goals / Non-Goals

**Goals:**
- Show an approval below the reply only while it asks.
- Show an answered approval Step's answer in the progress card, for every stored
  Conversation.

**Non-Goals:**
- Changing the protocol, the core or how approvals pause and resume.
- Changing other component kinds or how the card lists Steps (#19).

## Decisions

### 1. The UI owns both changes; the core stays as it is

The UI decides which components to show and reads the approval's answer from the stored
component. The Rust core keeps the component and its answer, so history and replay are
unchanged.

*Alternative considered:* the core completes the approval Step with `output: "approved"` or
`"rejected"`, so the card shows it like a decision's outcome. Approvals answered before the
change would still show no answer, and the answer would be stored twice.

### 2. Which approvals show

`MessageItem` leaves out a component whose kind is `approval` unless `approvalState(answer,
replyStatus)` is `asking`. The renderer keeps only the asking state (prompt and buttons), since
the reply no longer shows it in any other.

### 3. Matching an approval Step to its answer

`approvalAnswers(steps, components)` in `WorkflowProgress.tsx` gives, for each Step index,
`"approved"`, `"rejected"` or nothing. For the *n*-th run of an approval Step `s` (counting
earlier Steps with the same `step_id`), it takes the *n*-th `approval` component whose
`data.step_id` is `s`, both in the order they were added. A run without a component, or a
component without an answer, gives nothing. `WorkflowProgress` takes the message's components
as a new prop and shows ` · <answer>` after a done approval Step's name, like a decision's
outcome.

## Risks / Trade-offs

- **The card now depends on the components' order.** Components and Steps are both kept in
  the order they were added, in the store and in the UI's reducer, so the *n*-th run and the
  *n*-th component belong together. → A test covers an approval answered twice in a loop.
- **An approval answered on another device before it syncs** shows no answer until the
  `component.answered` event arrives, as today.
