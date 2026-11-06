# Proposal

## Why

When a message points at a table or chart without a `$` reference ("make that chart a bar
chart"), nothing tells Jev which file that chart or table came from, so its file pick misses
it. Issue #109 asks for the Conversation's tables and charts to count in routing. Tables and
charts are shown from files, and Jev already picks the file a message means (#108), so Jev only
needs to know which tables and charts each file was shown as.

## What Changes

- **Charts record their file**: a chart Plot draws from a file stores that file's name and ID,
  as `source` and `source_id`, the same fields a table shown from a file already stores.
- **Jev's file options name what each file was shown as**: an option of the `file` question
  reads "The file field-trial.csv, shown as the chart Yield by variety and the table Field
  trial". Jev then picks the file when a message says "that chart" or "that table", and the pick
  works as it already does: data Traits read the picked file, and prompt-based Traits see it
  marked.
- Only file names and component titles are sent to Typesafe, never component data.
- Out of scope: tables with no file behind them (such as Profiler's columns table), choosing
  between several charts of one file, charts drawn before this change (they record no file),
  and components of other Conversations.

No new external service, credential or cost: the descriptions ride in the existing Jev request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: the `file` question's options name the tables and charts shown from each file,
  and `route.start` carries them.
- `data-traits`: a chart records the file it was drawn from.

## Impact

- Sidecar: `adapters/data/replies.py` (the chart's `source` and `source_id`), `tools/tables.py`
  (a table remembers its file), `routing.py` (the option text).
- Rust core: `link.rs` (`RouteFile.shown_as`), `routing.rs` (filling it), `store.rs` (one query
  for the Conversation's tables and charts by file).
- No UI or schema change.
