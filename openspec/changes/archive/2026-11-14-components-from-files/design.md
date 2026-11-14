# Design

## Context

See proposal.md for the motivation; the requirements are in the delta specs. The full picture
of the three changes is in `docs/plan-components-tools-routing.md`.

- **Assets.** The `assets` table (`db.rs`) holds `id, name, media_type, size_bytes, source,
  rel_path, created_at, added_by_*, origin`. Migrations are positional SQL batches in
  `MIGRATIONS`, with `SCHEMA_VERSION` at 12. Files are listed in five places:
  - `assets::list`: the composer's lookups and Quarto;
  - `assets::project_files`: the Files screen, the `#` list, the Report panel and the Overview's
    names;
  - `overview::file_outputs`: `source = 'generated'`;
  - `history::results`: `conversation.results` and Jev's `file` options through
    `routing::file_options`;
  - message attachments, through `attachment.added`.

  The Outline builds its lists from messages only (`outline.ts`).
- **Components** are stored twice: in the `component.added` event body and in the `components`
  table (`id, message_id, kind, version, data, text, created_at, answer, step_index`). Replies
  are read back from the table (`store.rs` `components_in`), not from events. A table's source
  is `data.source_id`, which is read in three places: `components::source_asset_id` (tables
  only), `store::file_components` and the UI's table renderer.
- **History.** `history::content` appends each component's `text` to its message.
- **`$` references** are `TextComponent { kind: component }`. They are handled in four places:
  - the composer (`$` list, button, chips), the reference button on tables and charts
    (`component-references.tsx`) and `component-names.ts`, which holds the naming rules;
  - the core check in `conversations.rs`;
  - the `current` flag in `history::results`;
  - in the sidecar, `tools/tables.py` `read_reference`, `adapters/data/tables.py`
    `table_sources` and `adapters/prompt.py` `_material`.
- **Sidecar tools.**
  - `show_papers`, `show_theories` and `show_datasets` are thin wrappers in
    `tools/components.py`, listed in `TOOL_NAMES`, in the Rust mirror `library.rs` `TOOLS` and
    in the built-in Traits' `tools` lists.
  - `show_frame` (`tools/tables.py`) shows the data Traits' computed tables without a file:
    the profile, the validation results and the cleaning log.
  - `read_file` resolves an ID through `find_asset`, which searches `ctx.results()` only.

## Goals / Non-Goals

**Goals:**
- One place for a component's data, its source file, so the chat's copy (`preview`) is only
  what the UI shows.

**Non-Goals:**
- Changing a component's `text`. It stays the plain-text alternative used by the UI's fallback
  and by read-a-component.
- Backward compatibility. Projects saved by earlier versions only need to open; their
  components, `$` chips and replayed events may not load.

## Decisions

These were settled with the user while planning the change
(`docs/plan-components-tools-routing.md` and the questions on this change).

### Hidden is a flag on the Asset (Rust core)
A migration adds `assets.hidden INTEGER NOT NULL DEFAULT 0`. Hidden means hidden from the
user only: the listings that feed the UI filter `hidden = 0` (`assets::list`,
`assets::file_entries`, `overview::file_outputs`), and `asset.write` skips `attachment.added`
for a hidden file. The code sees hidden files: `history::results` adds the source files of the
Conversation's components, hidden or not, so models and Jev's options get them, and read-a-file
reads them through its usual lookup. Each entry carries `hidden`, so the data Traits' fallback
can skip hidden tables.

*Alternative:* a third `source` value. Rejected by the user in favour of a flag.

### Sizes are refreshed where files are touched (Rust core)
One helper in `assets.rs` compares a file's metadata length with `size_bytes` and updates the
row when they differ. `file_entries` already stats each file for `modified_at`, so it calls the
helper there; `asset.read` calls it on the first chunk (`offset` 0). A missing file changes
nothing.

### The source ID is a top-level field (Rust core, protocol)
A component carries `source_asset_id` next to `preview`, in `component.add`, in the
`component.added` event and in its own `components` column. The core never parses a kind's
preview to find its file; `components::source_asset_id`, `store::file_components` and the
overview read the column. The table preview keeps `source` (the file's name) and `sheet` for
the UI, and drops `source_id`; the table renderer opens `source_asset_id`.

*Alternative:* `source_id` inside the preview, as tables have it today. Rejected by the user.

### `data` is renamed everywhere (all three processes)
`preview` replaces `data` in the `components` column, the event payload, the link params, the
Rust and TypeScript types and the renderers' props. Nothing reads the old name.

### Every data component gets a source file when it is shown (sidecar)
- `show_table` with given rows saves `<title>.csv`, or `Table.csv` when there's no title,
  through `save_file` before adding the component. From the model form the file is visible;
  from `show_frame` with no file, hidden.
- Hidden files are named after their input: `<input>-profile.csv`, `<input>-checks.csv` and
  `<input>-cleaning-log.csv` for the data Traits, and `papers.json`, `datasets.json` and
  `theory-store.json` for the providers. Users never see them; models see the names in history
  lines, where they say what the file holds.
- The three provider adapters save their results with `save_file(hidden=True)`, then add their
  component with `ctx.component(...)`. That goes through one helper in `tools/base.py`, so the
  provider kinds have no tool of their own: `show_papers`, `show_theories` and `show_datasets`
  leave `TOOL_NAMES`, `library.rs` `TOOLS` and the built-in Traits' tool lists.
- When a save fails (over 32 MiB), a data Trait still shows its preview without a source, and a
  provider adapter falls back to text, as on a refused component today.

### `component.read` returns no preview
- `components::read` drops the preview from its answer and returns the stored
  `source_asset_id` for every kind.
- `conversation.results` components lose `current`, since no message references a component.
- `component_result` in `tools/components.py` returns the kind, the text and the source ID,
  with a note to use read-a-file.

### History lines (Rust core)
`history::content` replaces each component's `text` with
`[<kind> "<title>" from <source name>, id <id>]`. The title comes from the preview's `title`;
the source name from the source Asset, whose name is looked up when the messages are loaded.
The same title helper serves `overview::component_title`, so a component's title is read in one
place.

### Components are referenced in words (all three processes)
- The `component` Text Component kind is removed from Rust and TypeScript, and with it
  `check_reference`'s component branch and the `current` components in `history::results`.
- In the UI:
  - the `$` sign, list and toolbar button leave the composer;
  - the reference button (`component-references.tsx`) and `component-names.ts` are deleted;
  - the Outline takes a component's label from its title or source file.
- In the sidecar:
  - `table_sources` reads only `#` files;
  - `read_reference` is removed;
  - `_material` drops the `$` reference section.

## Risks / Trade-offs

- **Breaking protocol fields** (`preview`, `source_asset_id`, no `component` Text Components)
  → the core and the sidecar ship together, and the link protocol goes from 15 to 16
  (`SIDECAR_PROTOCOL` and `PROTOCOL`), so a mismatched sidecar is refused.
- **Hidden files take disk space with no way to see them** → they are deleted with their
  Project. Profile and validation tables are small, and the provider JSON files are at most a
  few hundred kilobytes.
- **A model's history no longer shows a table's first rows** → it reads the component or its
  file when it needs them. That was the intended trade, since it keeps unrequested content out
  of every call.
- **Without a reference button, the model must find a component from the words** → the
  history lines name each component's kind, title, source file and ID. Jev's component hint,
  in change 3, narrows it further.

## Migration Plan

- One migration (version 12 to 13):
  - adds `assets.hidden`;
  - renames `components.data` to `preview` (`ALTER TABLE … RENAME COLUMN`, available in the
    SQLite bundled with rusqlite);
  - adds `components.source_asset_id`, left empty for existing rows.
- Stored event bodies and earlier `$` chips are not converted. The test fixtures (`replay.json`, `events.json`) are updated to the new fields.
- No rollback beyond the existing rule: a newer database is refused by an older app.
