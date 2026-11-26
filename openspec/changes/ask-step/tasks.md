# Tasks

## 1. Approval definition (Rust core and sidecar)

- [x] 1.1 In `src-tauri/src/library.rs`, give `StepKind::Approval` the optional `answer` and
  `questions_by` fields, refuse `questions_by` without `answer` `"text"` and any other values,
  and count a `questions_by` `"model"` approval as a decision in `has_decisions`, so
  `needs_model` asks for a model. Verify: a Rust test with a valid written-answer approval
  (accepted, needs a model) and `questions_by` without `answer` (refused) passes with
  `cd src-tauri && cargo test`.
- [x] 1.2 In `sidecar/src/mini_me_sidecar/workflow/model.py`, read `questions_by` into `Step`
  (the sidecar never needs `answer`: the core handles the answer). Verify:
  `cd sidecar && uv run pytest tests/test_workflow_model.py` passes; task 3.2's tests cover it.

## 2. Answering (Rust core)

- [x] 2.1 Replace `answer_approval`'s `approved: bool` with an `answer` object
  (`ipc.rs`, `conversations.rs`): check it against the approval's kind and refuse misfits and
  blank text with `invalid_answer`; persist `component.answered` with it; persist the
  approval's `step.completed` with the sent text as `output`; resume on Approve, Send and Skip,
  complete on Reject. Add `text` to `RunResume` (`link.rs`) and fill it in `Runs::resume`.
  Verify: Rust tests for Send (output stored, run resumed with `text`), Skip (no output,
  resumed), a misfit answer and blank text (refused, nothing stored) pass.
- [x] 2.2 Add `prompt` to `RunPaused` (`link.rs`) and use it in `save_pause` (`runs.rs`) in
  place of the Step's prompt when present; `pause_reply` adds `answer: "text"` to the
  component's preview for a written-answer approval. Verify: a Rust test pausing with a
  model-written prompt stores a component whose preview and text hold it.

## 3. Pause and resume (sidecar)

- [ ] 3.1 In `workflow/decide.py`, move the material building (message and earlier outputs)
  into a helper used by `decide()` and a new `write_questions(ctx, instruction, message,
  earlier)`, which asks `ask_structured` for one text field and raises `questions_failed`
  ("I couldn't write my questions; send your message again.") when it is empty. Verify:
  `cd sidecar && uv run pytest` passes.
- [ ] 3.2 Add `questions` to the `Env` protocol and `Run` (`runs.py`, like `Run.decide`); in
  `_approval` (`graph.py`), on the first visit of a `questions_by` `"model"` approval, write the
  questions and pass them in the interrupt's value; keep `interrupt()`'s return value and, when
  it holds text, add a log entry with that output. In `Run.execute`, resume with
  `Command(resume={"text": ...})` and send the questions as `run.paused`'s `prompt`. Verify:
  tests in `tests/test_workflow_graph.py` for a resumed written answer (the next Step sees it
  among the earlier outputs), a skip (no output) and model questions asked once across pause
  and resume pass.

## 4. Data Traits read earlier outputs (sidecar)

- [ ] 4.1 In `adapters/data/choose.py`, add the run's earlier Step outputs (`ctx.steps`),
  labelled with their names, to the material after the message. Verify: a pytest of the
  material built with and without earlier outputs passes.

## 5. UI

- [ ] 5.1 Update the protocol types (`src/protocol/types.ts`: the approval Step's fields, the
  answer shapes) and `api.answerApproval` to send the `answer` object. Verify:
  `npx tsc --noEmit` passes.
- [ ] 5.2 In `src/components/interactive/approval.tsx`, show a written-answer approval with a
  multi-line text box, Skip and Send (Send disabled while blank; Ctrl/Cmd+Enter sends), and
  extend `approvalState` with answered and skipped. Verify: `approval.test.tsx` cases for the
  four answer states and the disabled Send pass (`npm test`).
- [ ] 5.3 In the Workflow progress card and the Steps timeline (`WorkflowProgress.tsx`,
  `SidePanels.tsx`), label written answers "Answered" or "Skipped", and open a done
  written-answer approval to show its questions and the answer. Verify:
  `WorkflowProgress.test.ts` covers the answered and skipped labels (`npm test`).
- [ ] 5.4 In the Workflow editor's approval inspector (`StepInspector.tsx` and its edit helpers),
  add "Ask for a written answer" and, while on, "AI model writes the questions"; turning the
  first off clears both. Verify: a `workflowEdit.test.ts` case for setting and clearing the two
  fields passes.

## 6. In the app

- [ ] 6.1 With the app running (the user runs `npm run tauri dev`): in a user-made Mini-Me,
  add a written-answer approval before a *Plan* Step; send an answer and check *Plan* uses it,
  then skip and check the run goes on; turn on "AI model writes the questions" and check the
  approval shows written questions, also after reopening the Conversation.

## Workflow follow-up

- Add lines to `CHANGELOG.md` under "New" for written answers to approvals.
- Archive the change with `/opsx:archive`, syncing its delta specs.
- Ask the user, then open the PR from `feat/ask-step` into `dev` (after #211 is merged, so it
  shows only this change's commits).
