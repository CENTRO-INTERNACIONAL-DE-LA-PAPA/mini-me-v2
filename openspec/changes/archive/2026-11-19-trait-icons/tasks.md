# Tasks

## 1. Core

- [x] 1.1 Add `icon: Option<String>` to `TraitDef`, `TraitDraft` and `TraitSummary`, skipped
  when absent; `save_trait` keeps the draft's icon. Add each built-in Trait's icon to
  `library/builtin.json` as listed in design.md. Verify: `cd src-tauri && cargo test` passes.

## 2. UI

- [x] 2.1 Add `icon` to `TraitSummary` and `TraitDraft` in `src/protocol/types.ts` and to
  `draftOf` and `EMPTY` in `TraitEditor.tsx`. Add `src/lib/traitIcons.ts` with the icon set
  and the lookup that falls back to the puzzle piece. Verify: `npx tsc --noEmit` is clean.
- [x] 2.2 Make `TraitIcon` take an icon name and pass each Trait's icon from `LibraryView`,
  `MiniMeEditor`, the Trait editor's header and `TraitNode`; the add-step menu keeps the
  puzzle piece. Verify: `npx tsc --noEmit` is clean and `npm test` passes.
- [x] 2.3 Make the header icon of a user-made Trait's editor a button opening a popover grid
  of the set, the puzzle piece first; picking sets the draft's icon. Verify: `npx tsc
  --noEmit` is clean.
- [x] 2.4 In the app: every built-in Trait shows its icon in the Library, a Mini-Me's Traits
  and Workflow Steps, and the icons read well; pick an icon for a new Trait, save, restart and
  see it kept; pick the puzzle piece to remove it; duplicate *Plan* and see its icon on the
  copy; a built-in Trait's icon opens no grid.

## Workflow follow-up

- Add to `CHANGELOG.md` under "New": each Trait has its own icon, and you choose one for your
  own Traits in the Trait editor.
- Archive the change (`/opsx:archive`), syncing its deltas into `openspec/specs/`.
- Open the pull request into `dev`, closing #88.
