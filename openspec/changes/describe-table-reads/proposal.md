# Proposal

## Why

Reading a table with the read-a-file tool sends up to 500 rows to the AI model, and every later
tool round of the reply sends them again (#210). Asking Assistant to show a table took about
3.5k input tokens before the read and about 21.9k after it, although showing the table needs
none of the rows: the show-a-table tool reads the file by its ID. Most questions about a table
need its shape, not its rows, and computing over it is the data Traits' job.

## What Changes

- Reading a table returns, by default, its description, the same one the data Traits give the
  model (row count, and per column the type, missing and distinct counts, range and top values,
  with no values for columns that may hold personal data), up to 20 rows from `start`, and a
  note that a table is shown to the user with the show-a-table tool and the file's ID.
- A new `rows` parameter returns that many rows from `start`, at most 500, as the columns, the
  rows as CSV and the total, without the description.
- Text files are read as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tools`: "Reading a file" returns a table's description and a few rows by default, and more
  rows on request.

## Out of scope

- Text files and their 100,000-character parts.
- Prompt caching.
- Reading a `table` component's rows through read-a-component.

## Impact

- **Sidecar:** `tools/files.py` (`read_file`), `tools/tables.py` (`table_result`) and the
  tool's schema in `tools/model.py`; the description comes from `adapters/data/describe.py`.
- **No change** to the core, the UI or the protocol. No new service or cost; replies that read
  tables cost fewer tokens.
