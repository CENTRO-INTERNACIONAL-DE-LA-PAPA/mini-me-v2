# Design

## Context

A Trait definition is `TraitDef` in `src-tauri/src/library.rs`; the built-in ones are in
`src-tauri/library/builtin.json`, user-made ones in `library.json`, saved through `TraitDraft`
and `UserLibrary::save_trait` (`src-tauri/src/user_library.rs`). The UI gets `TraitSummary`
(`src/protocol/types.ts`). Duplicate happens in the UI: `draftOf` in `TraitEditor.tsx` turns
the original's summary into a new draft. The puzzle piece comes from `TraitIcon`
(`src/components/library/LibraryParts.tsx`), the Trait editor's header (`TraitEditor.tsx`) and
`TraitNode` (`src/components/workflow/WorkflowCanvas.tsx`). The UI already uses `lucide-react`.

## Goals / Non-Goals

**Goals:**
- One list of Trait icons, in the UI; the core stores a name it never interprets.

**Non-Goals:**
- Changing a Trait's `color` or where it is used.
- Showing icons anywhere the puzzle piece does not show today.

## Decisions

These were settled with the user while planning:

- **An icon name, stored as-is by the core.** `TraitDef`, `TraitDraft` and `TraitSummary` gain
  `icon: Option<String>` (absent when none). The core neither checks nor lists the names, so
  the list of icons lives in one place.
- **The UI owns a fixed set of Lucide icons.** A new module, `src/lib/traitIcons.ts`, maps each
  name (Lucide's kebab-case name) to its component; a missing or unknown name gives the puzzle
  piece. The set is the built-in icons plus `notebook-pen`, `quote`, `search`, `microscope`,
  `sprout`, `leaf`, `globe`, `map`, `calendar`, `users`, `table`, `funnel`, `calculator`,
  `target`, `git-branch` and `pen`. Importing the named icons keeps the bundle small, unlike
  the whole Lucide set.
- **Built-in icons**, to be reviewed in the app: Summarize `file-text`, Assist
  `message-circle`, Find Papers `book-open`, Theorize `lightbulb`, Scout `compass`, Refute
  `scale`, Plan `list-checks`, Wonder `sparkles`, Experiment `flask-conical`, Search CIP
  Dataverse `database`, Code `code`, Collect Data `clipboard-list`, Model `sigma`, Predict
  `trending-up`, Index Sources `library`, Profile Data `scan-search`, Validate Data
  `badge-check`, Clean Data `eraser`, Join Data `merge`, Plot `chart-line`.
- **The picker is the header icon.** In a user-made Trait's editor, the header icon is a
  button opening a popover grid; built-in Traits show the icon without the button. The grid's
  first cell is the puzzle piece, which clears the icon; a new Trait starts without one.
- **The add-step menu keeps the puzzle piece.** Its "Trait step" item stands for no Trait in
  particular.
- **No tests.** The change maps a name to an icon with a fallback; it is checked in the app.

All of it is UI and Rust core; the sidecar never sees the icon. `TraitIcon` takes the Trait's
icon name, and the Trait editor, `MiniMeEditor`, `LibraryView` and `TraitNode` pass it. The
grid follows DESIGN.md: a white popover with a 1px border, ghost icon buttons, the picked one
marked as selected, every icon plain ink.

## Risks / Trade-offs

- [A name removed from the set later leaves saved Traits without their icon] → they show the
  puzzle piece, as for any unknown name.
- [Lucide renames an icon in an update] → the import fails to compile, so it is caught at
  build time, not at run time.
