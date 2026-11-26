# Proposal

## Why

Every Trait shows the same puzzle piece (in the Library, a Mini-Me's Traits and the Workflow
editor's Trait Steps), so Traits are hard to tell apart at a glance (issue #88).

## What Changes

- A Trait definition may carry an `icon`: the name of a plain line icon.
- Each built-in Trait gets an icon that fits it.
- The Trait editor lets the user pick the icon of a user-made Trait from a fixed set of line
  icons, by clicking the icon in the editor's header. Duplicating a Trait copies its icon.
- A Trait's icon shows wherever the puzzle piece shows today: the Library's Traits list, a
  Mini-Me's Traits, the Trait editor's header and Workflow Trait Steps. A Trait without an
  icon, or with one the app does not know, keeps the puzzle piece.
- The Workflow editor's generic "Trait step" item keeps the puzzle piece, since it stands for
  no Trait in particular.

Out of scope:
- Uploading custom images as icons.
- Coloured icons: icons stay plain line icons in ink, as DESIGN.md requires.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mini-mes`: a Trait definition gains an optional `icon`; built-in Traits carry one; a Trait
  is shown by its icon, or the puzzle piece without one.
- `library-editors`: the Trait editor offers an icon picker for user-made Traits.

## Impact

- Rust core: `TraitDef`, `TraitDraft` and `TraitSummary` gain `icon`
  (`src-tauri/src/library.rs`, `src-tauri/src/user_library.rs`); `library/builtin.json` gets
  an icon per built-in Trait.
- UI: the protocol types, a new module with the icon set, `TraitIcon`
  (`src/components/library/LibraryParts.tsx`), the Trait editor and the Workflow canvas.
- No protocol change to the sidecar; no new dependency (Lucide is already used).
