# Tasks

## 1. Rust core: record the Step run

- [x] 1.1 Add `step_index: Option<u32>` to `Component` in `protocol.rs` (`#[serde(default,
      skip_serializing_if = "Option::is_none")]`), and set it to `None` where components are
      built today (approvals, tests)
- [x] 1.2 Add migration 5 to `db.rs` (`ALTER TABLE components ADD COLUMN step_index
      INTEGER`) and bump `SCHEMA_VERSION`
- [x] 1.3 Write `step_index` in the `component.added` projection and read it in
      `component_columns` / `component_row` / `component` (`store.rs`)
- [x] 1.4 Give `conversations::add_component` the adding call's `step_id`. Under the lock,
      set `step_index` to the latest `message_steps` position of that Step in the reply,
      minus 1
- [x] 1.5 In `runs.rs`, pass the call's `step_id` from `run.calls` through `Place` to
      `add_component`
- [x] 1.6 Rust test: when a Step runs twice, a component added by the second run's call
      gets `step_index` 1, read back from the stored reply

## 2. UI: draw components with their Step

- [x] 2.1 Add `step_index?: number | null` to `Component` in `protocol/types.ts`
- [x] 2.2 Add the pure helper that splits a reply's components into the reply's own and
      those grouped by Step run (rules in design.md), with a `*.test.ts` covering: while
      streaming, everything is the reply's own; after completion, an earlier Step's
      component is grouped and the last Trait Step's is the reply's own; a component without
      `step_index` is the reply's own
- [x] 2.3 `MessageItem.tsx`: draw only the reply's own components under its text
- [x] 2.4 `WorkflowProgress.tsx`: let a done Trait Step with an output or components open,
      and draw its components below its output
- [x] 2.5 `SidePanels.tsx` (`StepsPanel`): draw each Step run's components below its output

## 3. Verify

- [x] 3.1 User runs `cd src-tauri && cargo test` and `npm test`
- [x] 3.2 User runs a Workflow with *Find Papers* before its final Step: the paper sources
      show under the reply while it runs, then only in the opened *Find Papers* Step and in
      the Steps timeline after it completes. A one-Step Mini-Me's components stay under its
      reply
