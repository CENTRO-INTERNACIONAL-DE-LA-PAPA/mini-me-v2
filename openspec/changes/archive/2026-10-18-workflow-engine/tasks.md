# Tasks

## 1. Workflow definitions in the library

- [x] 1.1 In `library.rs`, turn `Step` into the enum from design D2 (`Trait`, `Approval`, `Condition`, `Loop`, `Parallel`, with `id`, an optional `label` on control Steps, and a missing `type` read as `trait`), and add `Workflow::trait_steps()` and `Workflow::step(id)`. Verify: a `library.rs` test parses a one-Step Workflow without `type` and the nested Workflow from design D2.
- [x] 1.2 Replace the "exactly one Step" check in `Library::problems()` with the workflows spec's rules (unique IDs, known non-placeholder Traits, non-empty lists, at least one Trait Step, at least two uniquely labelled branches, `max_iterations` from 1 to 10, non-empty text), each problem naming the Mini-Me and Step ID. Verify: `library.rs` tests cover an unknown Trait in a nested Step, a duplicate Step ID and `max_iterations` 0.
- [x] 1.3 Give the thirteen existing Mini-Mes' Steps IDs named after their Trait in `builtin.json`. Verify: `cd src-tauri && cargo test library` passes, including the existing built-in tests.

## 2. Storage

- [x] 2.1 Add migration 3 to `db.rs` (`message_steps`, `components.answer`, `paused_runs`, as in design D7) and set `SCHEMA_VERSION` to 3. Verify: a `db.rs` test migrates a version-2 database and finds the new table and column.
- [x] 2.2 Add the events `step.started`, `step.completed`, `message.paused`, `message.resumed` and `component.answered` to `protocol.rs`, the `paused` status, `Message.steps` and `Component.answer` (both with serde defaults), and their projections in `store.rs` (steps by position, completion of the latest row for a Step ID, status changes, and the answer at most once). Update `fixtures/events.json` and `src/protocol/types.ts`. Verify: the `protocol.rs` fixture round-trip passes, and a `store.rs` test replays a reply with a loop's repeated Step and a pause and resume.
- [x] 2.3 Add `paused_runs` access in `conversations.rs` (insert with the approval component and `message.paused` in one transaction; take and delete), count `paused` in the `reply_in_progress` check, let `stop_reply` cancel paused replies and delete their row, and leave `paused` untouched in `recover_interrupted`. Verify: `conversations.rs` tests cover sending while paused (`reply_in_progress`), stopping a paused reply (row deleted), and reopening a Project with a paused reply (still paused).

## 3. Link protocol 5 in the core

- [x] 3.1 In `link.rs`, replace the `call.*` frames with `run.start`, `run.cancel`, `run.delta`, `run.progress`, `step.started`, `step.completed`, `run.paused`, `run.done`, `run.error` and `run.cancelled` with the trait-execution spec's payloads, set `SIDECAR_PROTOCOL` to 5, and update `fixtures/sidecar-frames.json`. Verify: the `link.rs` fixture test, which checks that every frame type is present, passes.
- [x] 3.2 Rename `TraitCalls` to `Runs` (design D6): start a run with the Workflow, its Traits, `input` and `context`; require a model when any adapter declares providers or the Workflow has a condition or loop; track calls from `step.started` until `step.completed`; map run frames to the message and Step events; enforce `state_too_large`; and cancel with `run.cancel` and the five-second timeout. Verify: the existing `trait_calls.rs` tests pass, ported to run frames, plus a test where `step.started` and `step.completed` frames become Step events.
- [x] 3.3 Look up `core.request` by the `call_id` of an active call in any run, use the Step's Trait for components and secret providers, and allow decisions only `secret.get` for the run's provider. Verify: tests for `component.add` from a Trait Step, `asset.read` from a decision (`unknown_method`), a request after `step.completed` (`call_not_active`), and `secret.get` from a decision.
- [x] 3.4 Handle `run.paused` (approval component, `paused_runs` row and `message.paused` in one transaction), and add the `answer_approval` IPC command (design D8): `not_paused` and `sidecar_unavailable` checks, then Approve resumes with `run.start` and `resume`, and Reject completes with the saved output. Verify: tests for pause then approve (a `run.start` with `resume` and a new `run_id` is recorded), pause then reject (completed with the saved output, no `run.start`), and a second answer (`not_paused`).
- [x] 3.5 In `routing.rs`, start a run instead of a single Trait call, with `needs_context` and `mini_me_name` in its context. Verify: `cd src-tauri && cargo test` passes, including the routing tests.

## 4. Sidecar Workflow engine

- [x] 4.1 Add `langgraph` to `sidecar/pyproject.toml`, pinned through `uv lock`, and set `PROTOCOL` to 5 in `link.py`. Verify: `uv sync --frozen` in `sidecar/` succeeds and `uv run python -c "import langgraph"` works.
- [x] 4.2 Add `workflow/model.py`, which parses `run.start`'s Workflow into dataclasses, marks final Trait Steps (design D3) and implements the Step output rules and the visibility of earlier outputs (branch scope, 50,000-character cap, newest kept). Verify: `tests/test_workflow_model.py` covers final marking for Investigator's Workflow, the parallel `## <label>` output, branch visibility and the cap.
- [x] 4.3 Add `steps` (earlier outputs) to `CallContext`, and let `write` send `run.delta` for final Steps while always collecting the Step's text. Make progress frames `run.progress`. Verify: through task 4.6's tests, and Scribe still streams in the app.
- [x] 4.4 Add `workflow/decide.py` (design D5), using structured output with a `Literal` of the choices and raising `invalid_decision` for anything else. Verify: `tests/test_decide.py` checks the `Decision` schema built from the labels and the `invalid_decision` path, using a fake chat model.
- [x] 4.5 Add `workflow/graph.py`, which compiles a Workflow to a LangGraph `StateGraph` with Trait, decision, parallel-join and approval (`interrupt`) nodes as in design D3, and `workflow/state.py`, which serializes and restores the checkpoint (`format: 1`, JSON only, base64) and raises `resume_failed` on bad input. Verify: `tests/test_workflow_graph.py` runs a sequence, a condition, a loop hitting its limit and a parallel Step with fake adapters and decisions, and checks that pausing at an approval and resuming from the serialized state continues after it.
- [x] 4.6 Replace `Runner` with a `Runs` manager that runs `run.start` (fresh or resumed) as one task, sends `step.*`, `run.paused` and the final frame, ends the run on the first Trait error (cancelling parallel branches), and implements `run.cancel` with the existing grace period. Verify: the Rust real-sidecar tests (`real_sidecar_streams_echo`, `…_cancels_echo` and the others), ported to runs, pass.
- [x] 4.7 Make the prompt adapter add earlier Step outputs as one user turn after history and before the material (ai-providers spec). Verify: `tests/test_prompt_turns.py` checks the turn order and the `--- <name> ---` headings, and that a call without earlier outputs gets the same turns as before.
- [x] 4.8 When a prompt adapter call has earlier Step outputs, add a sentence to its system prompt saying it is one Step of the Mini-Me's Workflow, that the earlier outputs and the message are its material, and not to comment on what the message alone lacks (ai-providers spec). Verify: `tests/test_prompt_turns.py` checks the sentence is present with earlier outputs and absent without; then task 6.2's reply opens without "The message contains no data".
- [x] 4.9 Fail a prompt adapter call with `provider_refused` when its stream ends with a content-filter or refusal finish reason after some text (ai-providers spec). Verify: `tests/test_prompt_turns.py` checks the finish-reason check for `content_filter`, `refusal` and `stop`.

## 5. UI

- [x] 5.1 In `src/protocol/eventStore.ts`, handle the new events (steps, `paused`/`resumed`, `answer`). Verify: `eventStore.test.ts` cases for a loop's repeated Step, pause and resume, and an answered component.
- [x] 5.2 Add the `WorkflowProgress` card (design D9, DESIGN.md's Workflow progress pattern) to `MessageItem`, shown for multi-Step replies, with done, running and waiting states and a done Trait Step's output toggled below it. Add the "Waiting for your approval" status, and make the Composer offer Stop while a reply is paused. Verify: the user checks an Investigator reply in the app (task 6.2).
- [x] 5.3 Widen renderer props to `{ data, answer, messageId, componentId, replyStatus }`, add `api.answerApproval`, and add the `approval` renderer to the catalogue (Approve and Reject while paused and unanswered, "Approved" or "Rejected" after, nothing if stopped). Verify: `approval.test.tsx` checks the three states, and `npm test` passes.

## 6. Investigator and verification

- [x] 6.1 Add Investigator to `builtin.json` with the Workflow from design D2, its description from the mini-mes spec and a new colour family (design D11), and show the user the colour before committing. Update the `library.rs` built-in tests to fourteen Mini-Mes. Verify: `cd src-tauri && cargo test library` passes, and the user approves the colour.
- [x] 6.2 The user sends "@Investigator does early planting reduce late blight?". Verify: *Scout* and *Wonder* run together, then *Plan* and the loop. The progress card shows each Step, and earlier outputs open from it. The approval appears and the reply is paused.
- [x] 6.3 With the reply paused, the user closes and reopens the app, tries to send a message (refused, Stop offered), then approves. Verify: the reply resumes, *Experiment* streams into the reply's text, and the approval shows "Approved".
- [x] 6.4 The user repeats 6.2 and rejects, then sends one message each to Scribe and Researcher. Verify: the rejected reply completes with the latest plan as its text, and the one-Step Mini-Mes stream as before, with no progress card.
- [x] 6.5 The user stops an Investigator reply while it is running, and another while it is paused. Verify: both show as stopped, and a new message can be sent afterwards.

## 7. Roadmap

- [x] 7.1 In the README Roadmap, rename row #11 to "Workflow engine" with this change's scope, and move the Mini-Me and Trait editors into row #16, together with the decisions recorded in proposal.md (app-wide storage, duplicate-only built-ins, instructions-only user Traits). Show the edit to the user before committing. Verify: the user approves the README diff.

## Workflow follow-up

- Archive the change with `/opsx:archive`, syncing its delta specs into `openspec/specs/`.
- Mark row #11 "Done" and the next row "Next" in the README Roadmap.
- Ask the user, then open the pull request from `feat/workflow-engine` into `dev`.
