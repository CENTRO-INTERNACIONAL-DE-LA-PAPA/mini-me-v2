# Tasks

## 1. Sidecar groundwork

- [x] 1.1 Add `pandas`, `pointblank` and `openpyxl` to `sidecar/pyproject.toml`, and `pytest` as a dev dependency (the bundle installs with `--no-dev`), then run `uv lock`. Verify: `uv sync --frozen` in `sidecar/` succeeds, `import pandas, pointblank, openpyxl` works there, and `uv run pytest` runs.
- [x] 1.2 Move `PROVIDER_NAMES`, `_chat_model` and `_provider_error` from `prompt.py` to `adapters/providers.py`, unchanged, and import them in `prompt.py`. Verify: the user sends one message to Scribe and it answers as before.
- [x] 1.3 Add `adapters/data/tables.py`: read referenced and attached Assets in order, keep `.csv`, `.tsv` and `.xlsx`, refuse files over 100 MiB, detect the encoding and the `.csv` delimiter, choose the Excel sheet (named in the message, else the first), and infer column types (number, text, date, boolean). Fail with the spec's messages when there is no table or a file can't be parsed. Verify: `tests/test_tables.py` covers a semicolon CSV with Latin-1 text, an Excel sheet choice, type inference and the no-table error.
- [x] 1.4 Add `adapters/data/describe.py` (the model's description of a table, with the 30-distinct and personal-name rules, and the "shared" line) and `adapters/data/preview.py` (at most 500 rows, under 1.5 MiB, `total_rows` and `source`, JSON-safe values). Verify: `tests/test_describe.py` checks that rows are never included, personal and high-cardinality columns list no values, and the shared line; `tests/test_preview.py` checks the row cap and that NaN and dates become JSON-safe.
- [x] 1.5 Add Pydantic schemas for the check catalogue, the cleaning actions and the join choice, with a helper that asks the model through `with_structured_output` and validates each entry against the tables, returning the valid entries and the ignored ones. Verify: `tests/test_catalogue.py` checks that entries naming unknown columns or with invalid parameters are ignored.

## 2. Data adapters

- [x] 2.1 `data-profile` adapter (no providers): shape, duplicate rows and per-column type, missing count and %, distinct and min/max with pandas; a text summary and a `table` component. Verify: task 4.2.
- [x] 2.2 `data-validate` adapter: default checks plus the model's checks run with pointblank; a results `table`, the failed count, `<stem>-validation.html` attached, and the shared line. Keep the check-running function separate from the model call. Verify: `tests/test_validate.py` runs the defaults and a range and a unique check on a small DataFrame and checks the passed/failed counts; then task 4.3.
- [x] 2.3 `data-clean` adapter: apply the chosen actions in order with pandas, hold back any action that would drop more than half the rows, write `<stem>-cleaned.<ext>` in the input's format, reply with the actions `table`, a preview and the shared line. Verify: `tests/test_clean.py` checks a value mapping, drop duplicates with its count, and a held-back destructive action; then task 4.4.
- [x] 2.4 `data-join` adapter: keys and join type from the model (or the single shared column when no model is set), `merge` with `indicator=True`, write `<stem>-joined.csv`, reply with counts, unmatched keys, a preview and the shared line. Verify: `tests/test_join.py` checks the counts and unmatched keys of a left join and the shared-column fallback; then task 4.5.
- [x] 2.5 Register the four adapters in `load_adapters`. Verify: the sidecar starts and the core's discovery lists `data-profile`, `data-validate`, `data-clean` and `data-join` (the app shows the sidecar as ready).

## 3. Library and UI

- [x] 3.1 Add the four Traits (instructions from design.md; *Profile Data* none; components `["table"]`) and the four Mini-Mes to `builtin.json`, with the IDs and colours from design.md. Update the `library.rs` tests for the names, components and Mini-Mes. Verify: the user runs `cd src-tauri && cargo test library`, or I run it on this Mac.
- [x] 3.2 Add `@tanstack/react-table` and `src/components/interactive/table.tsx` (header, sorting with nulls last, right-aligned tabular numbers, empty cells for null, scroll with a sticky header, "Showing n of m rows" footer for previews), styled per DESIGN.md, and register `table` in the catalogue. Verify: `table.test.tsx` checks sorting, nulls last and the preview footer, and `npm test` passes.

## 4. Verification

- [x] 4.1 Add sample files for manual checks under `sidecar/fixtures/data/`: `field-trial.csv` (semicolon-delimited, with duplicates, spelling variants of `variety`, missing-value codes and a `farmer_name` column), `plots.csv` and `harvest.xlsx` with two sheets. Verify: the files open in a spreadsheet app.
- [x] 4.2 The user sends "@Profiler #field-trial.csv" and "@Profiler #harvest.xlsx" (with no AI model needed). Verify: shape, duplicates and per-column table as in the spec; the Excel reply names the sheet it read.
- [x] 4.3 The user sends "@Validator #field-trial.csv plot_id must be unique and yield between 0 and 80". Verify: default and requested checks with passed/failed counts, the HTML report attached, the shared line, and no values of `farmer_name` shared.
- [x] 4.4 The user sends "@Curator #field-trial.csv fix the variety spellings and remove duplicate rows". Verify: actions listed with counts, `field-trial-cleaned.csv` attached, `field-trial.csv` unchanged.
- [x] 4.5 The user sends "@Linker join #harvest.xlsx to #plots.csv by plot_id". Verify: counts, unmatched keys, preview and `harvest-joined.csv`.

## Workflow follow-up

- On finishing: archive the change, and in the README Roadmap mark #10 "Done" and #11 "Next". (The "Table selections" row was added when this change was proposed.)
