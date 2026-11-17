# Tasks

## 1. Core

- [x] 1.1 Add `hand_off: Option<RunHandOff>` (`{ mini_me_id }`) to `RunContext` and set the
  protocol to 20; update the link fixture. Verify: `cd src-tauri && cargo test` passes.
- [x] 1.2 Ask `next_mini_me` in every Jev request; in `decide`, take a pick at or above the
  threshold that is not the answerer as the reply's hand-off, and pass it to the run. Update the
  question tests and extend the `decide` test. Verify: `cargo test` passes.
- [x] 1.3 Route a completed run's hand-off through `Routing`: `Runs` hands it over instead of
  starting the reply; `Routing` asks Jev the hand-off's questions with the request as the
  message, stores Jev's record on the reply that handed off, and starts the reply as for a
  message. Remove the refusal of a hand-off from a handed-off reply. Update the hand-off tests
  (chain accepted; a handed-off reply starts after Jev, with the handed file and no `file`
  question). Verify: `cargo test` passes.
- [x] 1.4 When a run with `context.hand_off` and no accepted hand-off completes and none of its
  Traits uses the prompt adapter, make the hand-off from the run's input and file, with its
  `hand-off` component. Add a test for a Mini-Me with and without a prompt Trait. Verify:
  `cargo test` passes.

## 2. Sidecar

- [x] 2.1 In `routing.py`, add the `next_mini_me` Choice from `mini_mes` with the `mini_me`
  option text; set the protocol to 20. Update `test_routing.py`. Verify:
  `cd sidecar && uv run pytest` passes.
- [x] 2.2 Add the function that finds the Traits reachable after a Step in
  `workflow/model.py`, with a test covering a sequence, a condition and a loop. Verify:
  `uv run pytest` passes.
- [x] 2.3 Read `context.hand_off` in `CallContext`; in `_material`, name each Mini-Me's Traits in
  the hand-off list, add the recommendation line, and add the later-Traits line. Update
  `test_prompt_turns.py`. Verify: `uv run pytest` passes.

## 3. UI

- [x] 3.1 Add words for `next_mini_me` in `jevDebug.ts`, and show Jev's block on a Mini-Me's
  message that has a Jev record. Verify: `npx tsc --noEmit` is clean and `npm test` passes.
- [x] 3.2 In the app, with "Show what Jev was asked" on:
  - send "find papers on late blight and write a short report" without a mention, and check
    Researcher hands off to a writing Mini-Me with a card, and the next reply starts;
  - check the reply that handed off shows the Jev block for the next reply, without `mini_me`
    or `reaction`;
  - ask Assistant for something another Mini-Me does, and check its model hands off when Jev
    recommends it;
  - check a Mini-Me whose Workflow has a later Trait doesn't hand off that Trait's work.

  Verify: the user's run confirms it.

## 4. Docs

- [x] 4.1 Update `docs/architecture.md` where it describes Jev's questions and hand-offs, and add
  the change's line to `CHANGELOG.md`. Verify: the text matches the specs.

## Workflow follow-up

- Archive the change (`/opsx:archive`).
- Commit in batches and push to PR #186.
- Mark change 5 done in `docs/plan-components-tools-routing.md`.
