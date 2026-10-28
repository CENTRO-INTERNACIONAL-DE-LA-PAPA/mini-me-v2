# Tasks

The change was first built for ranges of tables (`table-selections`). Tasks marked done
still hold as built; the others undo the range code or add the cut-down behaviour.

## 1. Component references in the Rust core

- [x] 1.1 Rename `TextComponentKind::Selection` to `Component` and remove `range` and `SelectionRange` from `TextComponent` in `src-tauri/src/protocol.rs`, and the matching `kind` and `range` in `src/protocol/types.ts`. Verify: `cd src-tauri && cargo test protocol` passes with a round-trip test of a `component` Text Component, and `npx tsc --noEmit` passes.
- [x] 1.2 Keep only the `source_asset_id` lookup of a table component in `src-tauri/src/components.rs` (its `source_id` when that is an Asset of the Project), removing the columns and row count used for ranges. Verify: unit tests cover a table with a `source_id` Asset, a `source_id` that is not an Asset, and a table without `source_id`.
- [x] 1.3 Check `component` Text Components in `conversations::validate_text_components`: the component is a `table` or `chart` of the same Conversation. Reject with `invalid_input` otherwise. Verify: unit tests accept a table and a chart, and reject an approval component and a table of another Conversation. In each case nothing is persisted.
- [x] 1.4 Return `source_asset_id` from `component.read` in `runs.rs`, and `current` on each component in `conversation.results`: `true` when the call's user message references it with `$`. Verify: unit tests on `results` and on the `component.read` answer.
- [x] 1.5 Raise `SIDECAR_PROTOCOL` in `src-tauri/src/link.rs` and `PROTOCOL` in `sidecar/src/mini_me_sidecar/link.py` to 8. Verify: `cargo test` and `cd sidecar && uv run pytest` pass with the handshake tests updated to 8.

## 2. Reading references in the sidecar

- [x] 2.1 Record `source_id` and `sheet` in new table components, and keep `source` for every table shown from a file, not only previews: `table_data` in `adapters/data/preview.py` takes them, and `show_frame`, `show_table` (with `asset_id`) and the data Traits pass them. Verify: `uv run pytest` passes with `test_preview.py` cases that a preview of an Excel sheet carries `source`, `source_id` and `sheet`, and that a small table of a file keeps `source` without `total_rows`.
- [x] 2.2 Remove the `rows` and `columns` range from `read_component` in `tools/components.py` and from its model tool's schema and description in `tools/model.py`. Return a table's source Asset ID when `source_asset_id` is set, and say in the tool description that `read_file` reads the full table. Verify: pytest cases for a preview naming its source Asset and a chart returned as its views.
- [x] 2.3 Replace `read_selection` with `read_reference(ctx, text_component) -> Table` in `tools/tables.py`: the source file when `source_asset_id` is set, otherwise the component's columns and rows as a typed frame, named `<name>.csv` from the label. Verify: pytest cases for a whole table without a file keeping column types and a preview read from its file.
- [x] 2.4 Make `table_sources` (which replaced `table_assets`) list `#` assets and `$` tables in message order, then attachments, with `replies.read_tables` reading `$` tables with `read_reference`. A `$` chart fails the call with a message naming it. `NO_TABLE` asks for a `#` file, a `$` table or an attachment. Verify: pytest cases for the order of a `$` table before a `#` file, a `$` chart, and a message with neither.
- [x] 2.5 List the current message's `$` references in the `prompt` adapter's `_material`: label, kind and component ID, without content. Verify: a pytest case on `_material` with one table and one chart reference.

## 3. Tables and charts

- [x] 3.1 Remove `table-selection.ts`, `table-selection.test.ts` and `table-references.tsx`, keeping only what the `$` list and the button need (names and labels) in a `component-names.ts` next to the components. Verify: `npm test` passes and `npx tsc --noEmit` passes.
- [x] 3.2 Turn `tableNames(messages)` into `componentNames(messages)`: tables by source stem, else title without a table extension, else "table"; charts by title, else "chart"; other characters to `-`; `-2`, `-3` for repeats across both kinds in order. Verify: `npm test` passes cases for a preview, a table title, a chart, no title, and a table and a chart with the same name.
- [x] 3.3 Return `table.tsx` to sorting by clicking a column header, with no row-number column and no sort arrow, as before the change. Verify: `table.test.tsx` passes with sorting by the header. The user checks the table in the app.
- [x] 3.4 Add the reference button to the header of `table.tsx` and `chart.tsx`, always showing the table's header to hold it. Verify: `table.test.tsx` and `chart.test.tsx` pass a case that clicking the button calls `appendReference` with the component's chip. The user checks the button's look in the app.

## 4. `$` references in the composer

- [x] 4.1 Update `references.ts`: `ReferenceKind` gets `component` instead of `selection`, `DraftReference` carries no `range`, `activeQuery` recognises `$`, `appendReference` adds a chip at the end of the text after a space, and `draftMessage` sends `component` Text Components. Remove `parseSelection` and the typed-range code. Verify: `references.test.ts` passes cases for a `$` query, appending a chip after existing text, and a sent message carrying the component's ID.
- [x] 4.2 Show the `$` list in `Composer.tsx` with the Conversation's tables and charts, newest first, each marked as a table or a chart, filtered by the query, inserting a reference. With no tables or charts, no list is shown. Verify: `npm test` passes and `npx tsc --noEmit` passes. The user checks the list in the app.
- [x] 4.3 Add a React context from `ChatView` through which a component's reference button appends its chip to the composer, leaving the rest of the text and the caret unchanged. Verify: `npx tsc --noEmit` passes. In the app, the user types some text, clicks a table's reference button, and sees the chip appended after the text, acting as one block.
- [x] 4.4 Draw `component` chips in sent messages (`segments`/`markdownSource` already handle any kind; give `component` the file chip's style in `MessageItem.tsx` and `Markdown.tsx`). Verify: `npm test` passes, and in the app a sent `$` reference shows as a chip.

## 5. End to end and docs

- [x] 5.1 Change the Text Component example in the glossary of `openspec/config.yaml` to a `$` table or chart component. Verify: the file reads correctly and `openspec validate component-references --strict` passes.
- [x] 5.2 Check the whole flow in the app: Curator cleans a CSV, the user references the preview with its button and sends it to Profiler, which profiles every row of the file; Plotter plots it, the user references the chart and sends it to Scribe, which explains it; sending the chart to Profiler fails saying it reads tables. Verify: the user confirms each reply.

## Workflow follow-up

- Archive with `/opsx:archive`, set Roadmap #14 to "Done" and #15 to "Next", then ask before
  opening the PR from `feat/component-references` into `dev`.
