# Tasks

## 1. Charts record their file

- [x] 1.1 Add `source_id` to `Table`, set by `read_table()` and by `read_reference()` for a table shown from a file, and add `source` and `source_id` to each chart's data in `replies.plot()`; verify with pytest tests that a table read from a file or from a `$` table shown from a file carries the file, and one built from rows does not

## 2. Jev's file options

- [x] 2.1 Add `ProjectState::file_components()` and `RouteFile.components`, filled in `file_options()`, with the frames fixture; verify with a unit test that a file lists the table and chart shown from it, newest first, and `cargo test` passes
- [ ] 2.2 Write the file criterion with the tables and charts shown from the file in `routing.py`; verify with a pytest test of the criterion for a file with a chart and a table, and one with none

## 3. Check and docs

- [ ] 3.1 Mention in `docs/using.md` that "that chart" or "that table" works without `#`; verify in the app that "@Plotter make that chart a bar chart" after a chart of a clean table redraws it from that file, and that the [DEBUG] Jev block shows the file picked

## Workflow follow-up

- Archive the change with `/opsx:archive`, then open the pull request into `dev`, closing #109.
