# Design

## Context

Jev's `file` question (#108) offers the Conversation's Assets from `history::results()`, sent in
`route.start.files` as `{ id, name }`; `routing.py` turns each into the criterion "The file
<name>". The pick reaches Traits as `context.file`, which data Traits read and prompt-based Traits
mark. A table shown from a file already stores the file in its data as `source` (name) and
`source_id` (Asset ID), through `table_data()`. A chart stores only its title and computed
views. Routing loads messages without component data.

## Goals / Non-Goals

**Goals:**
- Reuse the file pick end to end: no new question, no new run field, nothing new for Traits to
  read.
- A chart records its file the same way a table does.

**Non-Goals:**
- Telling apart several charts of the same file: the pick is the file.
- Tables with no file behind them, and charts drawn before this change.

## Decisions

### A table remembers its file; a chart copies it
`Table` (`adapters/data/tables.py`) gains `source_id: str | None`. `read_table()` sets it to the
Asset it read. `read_reference()` sets it, and names the table after `data.source`, when the
referenced table was shown from a file; a table built from a component's own rows has none.
In `replies.plot()`, each chart's data gets `source` and `source_id` from the table when it has
one, before it is shown. The field names match a table's, so the core reads both kinds alike.

### One query maps files to their tables and charts
`ProjectState::file_components(conversation_id)` returns, per Asset ID, the `{ kind, title }` of
the Conversation's `table` and `chart` components whose data holds that `source_id`, newest
first, reading only `json_extract(data, '$.source_id')` and `'$.title'`. `file_options()` adds
them to each `RouteFile` as `components`. No component's data is loaded.

### Jev reads it in the criterion
`routing.py` writes a file option as "The file field-trial.csv, shown as the chart Yield by
variety and the table Field trial" ("and" before the last, commas between the others). A
component without a title is named by its kind alone.

### No cap on the list
A file's `components` lists every table and chart shown from it. Nothing is cut; if Typesafe ever
refuses a long criterion, the route fails as any Jev error does and Assistant answers.

## Risks / Trade-offs

- [One file, several charts] → Jev picks the file; Plotter redraws from it, which is what
  "that chart" needs. A prompt-based Trait sees the file marked but not which chart.
- [A computed table, such as Profiler's columns] → It records no file, so it does not help the
  pick. The reply names what it used, as today.
- [Charts drawn earlier] → They record no file and do not help the pick.

## Migration Plan

None: no schema change, and older components simply have no `source_id`.
