# Tasks

## 1. Core

- [ ] 1.1 Add `traits` to `RouteMiniMe`, filled with each Mini-Me's Trait names in the order
  of their first Step; add `components` to `route.start` and `component` and `tools` to
  `RunContext`; set the protocol to 19. Verify: `cd src-tauri && cargo test` passes.
- [ ] 1.2 Read the Conversation's tables and charts with their IDs, kinds, titles and source
  file names, newest first, and send them as the `component` options. Ask `component` when
  there are some and `tools` always, neither in a comment thread. Update the question tests
  in `routing.rs`. Verify: `cargo test` passes.
- [ ] 1.3 In `decide`, pick the component at or above the threshold among the offered IDs and
  take the top four tool names, `none` left out; pass both to the run's context. Extend the
  `decide` test with these cases. Verify: `cargo test` passes.

## 2. Sidecar

- [ ] 2.1 In `routing.py`, write Mini-Me options with their Trait names, add the `component`
  question and the `tools` question from the model tools' names and descriptions without
  `hand_off`; set the protocol to 19. Update `test_routing.py`. Verify: `cd sidecar && uv run
  pytest` passes.
- [ ] 2.2 Read `context.component` and `context.tools` in `CallContext`; in `_material`, mark
  the picked component and add the "Likely useful" line when `tools` is not empty. Update
  `test_prompt_turns.py` where it checks the material. Verify: `uv run pytest` passes.

## 3. UI

- [ ] 3.1 Add plain words for `component` and `tools` in `jevDebug.ts`. Verify:
  `npx tsc --noEmit` is clean and `npm test` passes.
- [ ] 3.2 In the app, with "Show what Jev was asked" on:
  - draw a chart, then send "make that chart a bar chart" without a mention, and check the
    `[DEBUG] Jev` block shows the component and tools questions and the Mini-Me options with
    Trait names;
  - check the reply's model changes the right chart;
  - comment in a thread and check neither new question is asked.

  Verify: the user's run confirms it.

## 4. Docs

- [ ] 4.1 Update `docs/architecture.md` where it describes Jev's questions, and add the
  change's line to `CHANGELOG.md`. Verify: the text matches the specs.

## Workflow follow-up

- Archive the change (`/opsx:archive`).
- Commit in batches and push to PR #186.
- Propose `hand-off-chains`.
