# Tasks

## 1. show_results on Trait Steps (Rust core)

- [x] 1.1 In `src-tauri/src/library.rs`, give `StepKind::Trait` an optional `show_results`
  (omitted when false). In `runs.rs` (`step_started`) and the event, add `show_results` to
  `step.started`'s payload and to `MessageStep`. Verify: a Rust test that a Step with
  `show_results` produces a `step.started` event and a loaded step with `show_results` true,
  and one without gives false (`cd src-tauri && cargo test`).

## 2. The summary (sidecar and core)

- [x] 2.1 Add `run.summary` `{ run_id, call_id }` to the sidecar frames (`link.rs`); in
  `runs.rs`, register its `call_id` as a decision call with no Step, so it can get the AI key,
  persisting nothing. Verify: a Rust test that a `run.summary` call's key request is answered
  and its `run.delta` text becomes the reply's text; update `fixtures/sidecar-frames.json`.
- [x] 2.2 In the sidecar, compile a multi-Step Workflow with no final Steps, and add
  `workflow/summary.py` with the summary instructions and `summarize(ctx, message, earlier)`,
  which streams the model's text through `ctx.write`. In `Run.execute`, after a run that did
  not pause: for a multi-Step Workflow, send `run.summary`, summarize from `visible_outputs` of
  the run, and on a `TraitError`, no model or an empty summary, write the last top-level output
  as today. Verify: tests that a multi-Step run streams no Step and, without a model, sends no
  `run.summary` and ends with the last output; a one-Step run still streams (`cd sidecar && uv
  run pytest`). The summary call itself is checked in the app (5.1), since a test would drive a
  fake model.

## 3. UI

- [ ] 3.1 Add `show_results` to the protocol types (`MessageStep`, the Trait Step of
  `WorkflowStep`), and change `componentPlaces` so a reply's own components are those with no
  `step_index`, those of Step runs with `show_results`, and, for a one-Step Workflow, its
  Step's. Verify: `WorkflowProgress.test.ts` cases for each rule pass (`npm test`).
- [ ] 3.2 Move the selected Step from `WorkflowProgress` to `MessageItem`: the card takes the
  selected index and `onSelect`, and no longer draws an opened Step's content; while a Step is
  selected, `MessageItem` shows that Step run's output and components (or an approval's
  `WrittenAnswer`) in place of the reply's text and own components, keeping attachments,
  reactions and notes. Verify: `npx tsc --noEmit` and `npm test` pass.
- [ ] 3.3 Add "Show its results in the reply" to the Trait Step inspector (`StepInspector.tsx`).
  Verify: `npx tsc --noEmit` passes and the switch sets and clears `show_results`.

## 4. Library

- [ ] 4.1 In `src-tauri/library/builtin.json`, set `show_results` on Exploratory Data
  Analysis' *Profile Data*, *Describe Variables*, *Find Correlations*, *Detect Outliers*, *Find
  Clusters* and *Plot* Steps, and on Diagnostic Analytics' *Compare Groups*, *Find Drivers*,
  *Check Confounders*, *Analyze Trends* and *Plot* Steps. Verify: `cd src-tauri && cargo test`
  passes.

## 5. In the app

- [ ] 5.1 With the app running (the user runs `npm run tauri dev`): an Exploratory Data
  Analysis reply streams a summary after its Steps, with the analyses' tables and charts under
  it; selecting a Step shows only that Step's text and components, and selecting it again
  brings the summary back; an Investigator reply ends with a summary; Profiler (one Step) is
  unchanged.

## Workflow follow-up

- Add lines to `CHANGELOG.md` for the summary and the Step results.
- Archive the change with `/opsx:archive`, syncing its delta specs.
- Ask the user, then open the PR from `feat/workflow-results` into `dev`, closing #70.
