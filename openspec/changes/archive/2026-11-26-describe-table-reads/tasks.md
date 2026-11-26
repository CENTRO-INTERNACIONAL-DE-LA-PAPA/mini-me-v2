# Tasks

## 1. Reading a table (sidecar)

- [x] 1.1 In `sidecar/src/mini_me_sidecar/tools/tables.py`, change `table_result` to take the
  `Table` and an optional `rows`: without it, the description (`describe`), up to 20 rows from
  `start`, the total, `more` and the show-a-table note; with it, the columns and up to
  `min(rows, 500)` rows from `start`, the total and `more`. Pass `rows` through `read_file`
  (`tools/files.py`). Verify: tests in `sidecar/tests/test_tools.py` for a default read of a
  1,200-row table (description, 20 rows, total, note) and a read with `rows` from 500 pass
  (`cd sidecar && uv run pytest`).
- [x] 1.2 Add `rows` (1 to 500) to the read_file schema in `tools/model.py` and reword its
  description. Verify: `cd sidecar && uv run pytest` passes.

## 2. In the app

- [x] 2.1 With the app running (the user runs `npm run tauri dev`), "@Assistant show me
  #<table>.csv" shows the table, and the reply's debug block shows the input tokens of its later
  rounds close to the first round's.

## Workflow follow-up

- Add an "Improved" line to `CHANGELOG.md`.
- Archive the change with `/opsx:archive`, syncing its delta spec.
- Ask the user, then open the PR from `perf/describe-table-reads` into `dev`, closing #210.
