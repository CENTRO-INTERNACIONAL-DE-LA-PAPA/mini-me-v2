# Proposal

## Why

An Interactive Component holds its own copy of its data, and models see that copy in three
places: the Conversation history (every component's text), `read_component` (its full data) and
the `$` references. A table shown from a file and the file itself can disagree, and models get
component content they did not ask for. Making each component's file the one source of its data,
and giving models a component's content only when they read it, gives every Trait one path to
data. This is change 1 of 3 of `docs/plan-components-tools-routing.md`.

## What Changes

- **Hidden files.** An Asset can be hidden from the user: the Files screen, the `#` list, the
  Outline, the Overview's latest outputs and reply attachments leave it out. Traits and Jev see
  it like any other file of the Conversation.
- **Fresh file sizes.** A file can change outside the app (edited in Excel), so the core
  refreshes an Asset's stored size whenever it lists or reads the file.
- **Every table and chart has a source file.**
  - Rows a model shows with show-a-table are saved first as a visible file.
  - Tables a Trait computes (Profile Data's columns, Validate Data's checks, Clean Data's
    actions) are saved first as hidden files.
- **Provider Traits save their results as hidden JSON files**, which become their components'
  source: Find Papers (papers), Theorize (`theory-store.json`, no longer attached to the reply)
  and Search CIP Dataverse (the first page of datasets). Their show tools (show-papers,
  show-theories, show-datasets) stop being tools: each adapter adds its own component.
- **A component's `data` becomes `preview`**: what the chat shows, kept so earlier replies stay
  as they were. A component also records its source file's ID. **BREAKING** for the
  `component.add` params, the `component.added` payload and the `components` table.
- **read_component** returns a component's kind, text and source file ID, not its preview. A
  model reads the data with read_file.
- **History lines.** In the history sent to models, a component's text is replaced by one line
  with its kind, its title or source file, and its ID.
- **`$` references and the reference button are removed.** No `$` typing, list or toolbar
  button, no component names, no reference button on tables and charts. The user describes a
  component in words, and the model finds it among the Conversation's components.
  **BREAKING** for the `component` Text Component kind.
- **No backward compatibility.** Projects saved by earlier versions are not kept working:
  their components and `$` chips may not load. Only the database migration needed to open them
  is kept.
- **Outline.** Tables and charts are listed by title, or by source file when untitled.
- **Overview summary.** Only files are marked and shown as pills; table and chart names are plain
  text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `assets`: Assets gain a hidden flag; the UI does not show hidden files; stored sizes are refreshed.
- `interactive-components`: `data` becomes `preview`; components record a source file; table
  previews open their source file.
- `component-references`: every requirement is removed (`$` references, component names and the
  reference button).
- `conversation-context`: history lines replace component text; `conversation.results` lists
  components' source files, hidden or not, and drops components' `current` flag;
  `component.read` returns no preview.
- `trait-execution`: `asset.write` can write a hidden file, which is not attached to the reply.
- `tools`: show-a-table saves given rows as a file first; read-a-component returns no preview; reading `$` tables is removed; provider show
  tools are no longer tools.
- `tool-use`: prompt Traits are no longer told about `$` references.
- `data-traits`: tables are read only from files; charts record their source file.
- `asta`: Find Papers and Theorize save their results as hidden JSON files.
- `dataverse`: Search CIP Dataverse saves its first page as a hidden JSON file.
- `conversation-outline`: tables and charts are listed by title or source file.
- `project-overview`: hidden files are not latest outputs; the summary marks and links files only.

## Out of scope

- Tools shared by every Mini-Me, the single edit-a-document tool and removing the
  `document-edits` card (change 2).
- Jev's component, tool and hand-off hints, and hand-off changes (change 3).
- Several files or components in one message for Jev.
- Changing how files are stored on disk or opened (they keep `assets/<id>/<name>` and the
  system's default app).
- Saving Dataverse pages loaded with "Show more".

## Credentials, services and cost

None. No new service, credential or cost.

## Impact

- Rust core: `db.rs` (migration: `assets.hidden`, `components.preview` and
  `components.source_asset_id`), `assets.rs`, `components.rs`, `conversations.rs`, `history.rs`,
  `runs.rs`, `routing.rs`, `store.rs`, `overview.rs`, `protocol.rs`, `library.rs`, event fixtures.
- Sidecar: `context.py`, `tools/` (`components.py`, `tables.py`, `files.py`, `__init__.py`,
  `model.py`), `adapters/asta.py`, `adapters/dataverse.py`, `adapters/data/` (`replies.py`,
  `tables.py`), `adapters/prompt.py`.
- UI: `types.ts`, `InteractiveComponent.tsx`, renderers (`table.tsx`, `chart.tsx`,
  `paper-sources.tsx`, `theories.tsx`, `dataset-results.tsx` and the core kinds),
  `Composer.tsx`, `references.ts`, `component-names.ts` (removed),
  `component-references.tsx` (removed), `outline.ts`, `WorkflowProgress.tsx`,
  `CommentsSheet.tsx`.
- Built-in library: the Trait tool lists of Find Papers, Theorize and Search CIP Dataverse.
- No new dependencies.
