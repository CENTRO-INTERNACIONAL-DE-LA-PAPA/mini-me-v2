# Design

## Context

See proposal.md for why. `read_file` (`sidecar/src/mini_me_sidecar/tools/files.py`) reads a table through `read_table` and returns `table_result(frame, start)` (`tools/tables.py`): the columns with their types, up to `MAX_ROWS` (500) rows from `start` as CSV, the total and `more`. The data Traits describe a table to their model with `describe(table)` (`adapters/data/describe.py`), which never lists values of columns that may hold personal data.

## Goals / Non-Goals

**Goals:**
- A default table read costs about as much as its description and a handful of rows.
- The model can still get any rows it needs, explicitly.

**Non-Goals:**
- Changing what the description holds, or how text files are read.

## Decisions

### Settled with the user (#210)

1. **The default is the description plus about 20 rows**; a `rows` parameter gives more, at most 500 per call.
2. **The result says how to show a table**: with the show-a-table tool and the file's ID, not by copying rows.

### Approach

3. **One function, two shapes.** `table_result(table, start, rows)` returns, without `rows`, `{ description, start, total_rows, more, csv, note }` with up to `SAMPLE_ROWS` (20) rows; with `rows`, today's `{ columns, start, total_rows, more, csv }` with up to `min(rows, MAX_ROWS)` rows. It takes the `Table` so `describe` gets the file name.
4. **The description is `describe(table)`**, the data Traits' own, so personal columns' values are never listed, and both paths stay the same.
5. **The schema** (`tools/model.py`) adds `rows` (integer, 1 to 500) and says that a plain read gives the description and 20 rows, that `rows` asks for more, and that a table is shown with show_table and its ID.

## Risks / Trade-offs

- **[More calls for row-level questions]** A question about specific rows needs a second read with `rows`. → The note and the schema say so; one extra small call is still far cheaper than 500 rows resent every round.
- **[Sample rows still show values]** The 20 rows may include personal values, as today's 500 do. → Unchanged in kind and much smaller; the description itself lists none.
