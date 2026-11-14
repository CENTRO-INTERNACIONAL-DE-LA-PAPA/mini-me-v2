# Tasks

## 1. Core: hidden files and sizes

- [x] 1.1 Add migration 13: `assets.hidden` (default 0), `components.data` renamed to
  `preview`, and `components.source_asset_id`. Bump `SCHEMA_VERSION`, and extend the existing
  migration test to open a version 12 database. Verify: `cd src-tauri && cargo test db` passes.
- [x] 1.2 Register the `hidden` flag in `assets.rs`, and leave hidden Assets out of the UI's
  listings (`assets::list`, `file_entries`, `overview::file_outputs`). Add the source files of
  the Conversation's components to `history::results`, with `hidden` on each entry. Add one test that writes a hidden and a
  visible file and checks the UI listings and `results`. Verify:
  `cd src-tauri && cargo test assets` passes.
- [x] 1.3 Take `hidden` in `asset.write` (runs.rs), skipping `attachment.added` for a hidden
  file. Add the case to the existing asset write test. Verify: `cd src-tauri && cargo test runs`
  passes.
- [x] 1.4 Add the size refresh helper in `assets.rs`, called from `file_entries` and from
  `asset.read` at offset 0. Test: grow a file on disk, then list it. Verify:
  `cd src-tauri && cargo test assets` passes.

## 2. Core: components

- [x] 2.1 Rename `data` to `preview` in `protocol.rs`, `store.rs`, `overview.rs`,
  `components.rs`, `conversations.rs` and `comments.rs`, and update the `replay.json` and
  `events.json` fixtures. Verify: `cd src-tauri && cargo test` passes.
- [x] 2.2 Add `source_asset_id` to `component.add`, the `component.added` component and the
  `components` row. Refuse an unknown source with `invalid_component` in `components::check`,
  and read the column in `components::source_asset_id`, `store::file_components` and
  `overview`. Extend the `components.rs` check test. Verify: `cd src-tauri && cargo test`
  passes.
- [x] 2.3 Make `component.read` answer `{ kind, version, text, source_asset_id }`, and drop
  `current` from `conversation.results` components.
  Update the existing read and results tests. Verify: `cd src-tauri && cargo test` passes.
- [x] 2.4 Replace component text in `history::content` with the component line. Move the
  title lookup into one helper shared with `overview::component_title`. Update the history test
  for components. Verify: `cd src-tauri && cargo test history` passes.
- [x] 2.5 Remove the `component` Text Component kind and its branch in `check_reference`, and
  set `SIDECAR_PROTOCOL` to 16. Update the reference test in `conversations.rs`. Verify:
  `cd src-tauri && cargo test` passes and `cargo clippy` is clean.

## 3. Sidecar: tools and adapters

- [x] 3.1 In `context.py`, send `preview` and `source_asset_id` from `component(...)` and
  `hidden` from `write_asset(...)`. Set `PROTOCOL` to 16. Verify: `cd sidecar && uv run pytest` passes.
- [x] 3.2 Give `save_file` a `hidden` option that the model form does not offer. Add a
  `test_tools.py` case saving a hidden file. Verify: `cd sidecar && uv run pytest tests/test_tools.py` passes.
- [x] 3.3 Have `show_table` save given rows as `<title>.csv` before adding the component:
  visible from the model form, hidden from `show_frame` with no file, named after its input
  (`-profile`, `-checks`, `-cleaning-log`). Set `source_asset_id` on every table and on Plot's
  charts. Update the given-rows tests. Verify: `cd sidecar && uv run pytest` passes.
- [x] 3.4 Make `component_result` return the kind, the text and the source ID with the
  read-a-file note. Update the `read_component` tests. Verify:
  `cd sidecar && uv run pytest tests/test_tools.py` passes.
- [x] 3.5 Add the provider helper in `tools/base.py` (save the hidden file, then add the
  component). Use it in Find Papers (`papers.json`), Theorize (`theory-store.json`) and Search
  CIP Dataverse (`datasets.json`), each falling back to text. Remove `show_papers`,
  `show_theories` and `show_datasets` from `TOOL_NAMES`, `library.rs` `TOOLS` and
  `library/builtin.json`. Verify: `cd sidecar && uv run pytest` and `cd src-tauri && cargo test`
  pass.
- [x] 3.6 Remove `$` reading: `read_reference`, the `component` branch of `table_sources`,
  and the `$` section of `_material`. Make the data Traits' fallback skip hidden files, with a
  `test_tables.py` case for a hidden table newer than the trial file. Update `test_tables.py` and `test_prompt_turns.py`.
  Verify: `cd sidecar && uv run pytest` passes.

## 4. UI

- [x] 4.1 Rename `data` to `preview` and add `source_asset_id` in `types.ts`, the renderer
  props and the three direct readers (`InteractiveComponent.tsx`, `WorkflowProgress.tsx`, the
  Outline). Remove the `component` Text Component kind. Verify: `npx tsc --noEmit` is clean.
- [x] 4.2 Have the table renderer open `source_asset_id` from "Showing n of m rows". Update
  `table.test.tsx`. Verify: `npm test` passes.
- [x] 4.3 Remove `$` from the composer (sign, list, toolbar button), delete
  `component-references.tsx`, `component-names.ts` and their tests, and remove the reference
  button from the table and chart headers and `CommentsSheet.tsx`'s use of names. Verify:
  `npx tsc --noEmit` is clean and `npm test` passes.
- [x] 4.4 Label the Outline's tables and charts by title, source file, or "Table"/"Chart".
  Update `outline.test.ts`. Verify: `npm test` passes.
- [x] 4.5 In the app: show a model-made table, profile a file, find papers and theorize. Check
  that Files lists the sample CSV but none of the hidden files, and that no reply attaches
  `theory-store.json`. Then ask a follow-up about "the papers" and check that the model reads
  the papers' file. Verify: the user's run confirms it.

## 5. Docs

- [x] 5.1 Remove any mention of `$` references and the reference button from `docs/using.md`
  and `docs/architecture.md`, and add the change's line to `CHANGELOG.md` under "Improved".
  Verify: `grep -n '\$' docs/using.md docs/architecture.md` shows no reference to components.

## Workflow follow-up

- Archive the change (`/opsx:archive`). `component-references` has no requirement left, so
  delete `openspec/specs/component-references/`.
- Commit `docs/plan-components-tools-routing.md` with the change, then continue with change 2
  (shared tools and the document edit tool) on the same branch.
