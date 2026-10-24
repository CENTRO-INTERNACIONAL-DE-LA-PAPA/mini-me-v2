# Design

## Context

References already flow end to end for `#` files and `@` mentions. The composer keeps
`DraftReference`s next to its text (`src/protocol/references.ts`) and sends them as
`text_components`. The core checks them in `conversations::validate_text_components` and
stores them as JSON in `messages.text_components`, so the stored shape can grow without a
migration. The sidecar receives the user message as `ctx.message` in each call's context.
Data Traits pick their tables from it with `adapters/data/tables.py::table_assets`, and the
`prompt` adapter lists the Conversation's results for its model (`_material`) and offers it
`read_file` and `read_component`.

Table components hold at most 500 rows (`preview.py`). A longer table is a preview whose
`source` is a file *name*, not an ID. Only the sidecar parses tables (pandas). The core
never does: it has the component's JSON data and the Assets. A chart component holds its
title and views with the plotted values (bins, bars, points), not the rows it was drawn
from, and names no source file.

## Goals / Non-Goals

**Goals:**
- One reference shape the core can check at send time, so a Trait never meets a reference
  to something it cannot read.
- Reading a reference lives in the existing read tools, so every Trait gets it without
  adapter-specific code.
- No parsing of tables in Rust, and no new link frame.

**Non-Goals:**
- Referencing part of a component. A reference always names a whole table or chart.
- Resolving references by their label. Only the component ID is resolved.
- Storing component names. They are derived where they are shown.

## Decisions

### Ownership by process
- **UI:** the reference button in `table.tsx` and `chart.tsx`, working out the names of the
  Conversation's tables and charts, appending `$` chips, and the `$` list in the composer.
- **Rust core:** checks a `component` Text Component at send time, resolves a table's source
  Asset (`source_asset_id`) for `component.read`, and marks referenced components `current`
  in `conversation.results`. Durable state is only the message, as today.
- **Sidecar:** names a preview's source Asset in `read_component`, includes `$` tables in the
  data Traits' table list and refuses `$` charts there, lists `$` references in the `prompt`
  adapter's material, and writes `source_id` and `sheet` into new table components.

### The reference: a third Text Component kind
`TextComponent` gains `kind: "component"`, whose `id` is the table or chart component's ID.
It carries no range. The label (for example `$field-trial-cleaned`) is plain text in the
content, like `#` and `@` labels, so history, Jev and models see it without any change to
them.

Alternatives considered:
- Parsing the label in the core, which was rejected: names need quoting rules, and a
  renamed or duplicated name would point somewhere else.
- A separate `references` list on the message, which was rejected: Text Components already
  carry positions, chips and rendering.
- Ranges of rows and columns with drag selection in tables, which was rejected after trying
  it: asking for a part in words, or with a data Trait, served as well, at a fraction of the
  code.

### Names are derived in the UI
`componentNames(messages)` walks the Conversation's table and chart components in order and
applies the naming rule from the spec, adding `-2`, `-3` for repeats across both kinds, as
they share one `$` list. The name goes into the label only. Resolution always uses the
component ID, so a name never has to be unique across Projects or stable across versions.
The sidecar names a referenced table by the label's name (the text after `$`) plus `.csv`,
for file names such as Clean Data's `<name>-cleaned.csv`.

Charts are named by title, not by a source file. Plot gives every chart a title, and a chart
named after its file would always clash with that file's table and become `-2`.

Alternative considered: the core assigning and storing names, which was rejected because it
would add a stored field for something only used in labels.

### Finding a preview's file: `source_id`
New table components record `source_id` (the Asset ID) and `sheet` next to `source`, which
`show_frame`, `show_table` and the data Traits already know. `table_data` keeps `source`
for any table shown from a file, not only previews. Otherwise a small cleaned table would
be named after its title ("Cleaned field-trial") and a large one after its file
(`field-trial-cleaned`). Tables made before this change have no `source_id`, so they
count as tables without a file: a reference reads only the rows they hold. They get no
lookup by name, because the app has no other users yet. Confinement holds: the sidecar still
reads only through `asset.read` by ID, which checks the Project folder.

### Reading references in the sidecar
`read_component(component_id, start=0)` keeps its paging. For a table it adds the source
Asset's ID when `source_asset_id` is set, so a model that needs the whole table reads it
with `read_file`. A chart is returned as its data, as any non-table kind already is. The
read-a-table tool gets `read_reference(ctx, text_component) -> Table`, which reads the
source file with `read_table` (the component's `sheet` passed as the sheet text) when
`source_asset_id` is set, and otherwise builds a frame from the component's columns and rows,
keeping their types. pandas is imported on demand there, as `read_file` does.
`table_assets` becomes `table_sources`: `#` assets and `$` tables in message order, then
attachments. A `$` chart there fails the call with a message naming it, before any table is
read.

### The reference button and the composer
A reference button in the header of each table and chart (a lucide icon, with an
accessible name and a tooltip) calls an `appendReference` callback that `ChatView` passes to
its components through a React context, so a component never imports the composer. The
callback adds the chip at the end of the text, after a space, and leaves the caret where it
was. A table without a title or feature button still gets its header, to hold the button.

`activeQuery` learns `$`, and `ReferenceKind` gets `component`. Picking from the `$` list
inserts `{ kind: "component", id, label: "$name" }`.

Alternative considered: no button, only the `$` list, which was rejected because the
button sits on the component the user is looking at, and appending can't overwrite
anything; a chip added by mistake goes with one Backspace.

### Link protocol 8
The message shape changes additively. The sidecar now needs the core's `source_asset_id`
and component `current`, so a newer sidecar against an older core would read previews
wrongly. The protocol version goes from 7 to 8, so a mismatch is reported instead.

## Risks / Trade-offs

- [A reference to a large preview reads the whole file] → Reads go through the existing
  100 MiB limit and the per-call read cache (`ctx.reads`), so a call parses each file once.
- [Previews made before this change read only the 500 rows they hold] → Accepted. Running
  the Trait again makes a table with `source_id`.
- [A chart's title can change between versions of Plot, renaming its reference] → Names are
  labels only; resolution uses the component ID.

## Migration Plan

No `project.sqlite` migration: Text Components are stored as JSON, and older messages
simply have no `component` references. The `#selection` example in the glossary in
`openspec/config.yaml` becomes a `$` table or chart component.
