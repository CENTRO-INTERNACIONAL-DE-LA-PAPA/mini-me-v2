# Tasks

## 1. Editor

- [x] 1.1 In `MiniMeEditor.tsx`, order the tabs Appearance, Workflow, Traits and open on
  Appearance. Verify: `npx tsc --noEmit` is clean.
- [x] 1.2 Add the eight families to `COLOR_FAMILIES` in hue order. Verify: `npx tsc --noEmit`
  is clean and `npm test` passes.
- [x] 1.3 Move the debug view's roll into `randomAvatar()` in `parts.ts` and `randomFamily()`
  in `palette.ts`; add the Random button with `DicesIcon` beside the editor's avatar preview,
  setting the draft's avatar and colours. Verify: `npx tsc --noEmit` is clean.
- [x] 1.4 Add `scrollbar-gutter: stable` as a base rule in `src/index.css`. Verify: `npm test`
  passes.

## 2. Check

- [x] 2.1 In the app: the editor opens on Appearance, first in the row, for a new and a
  built-in Mini-Me; sixteen swatches in hue order, each giving a readable avatar; Random changes
  the look and colour but not the name, description or group, and saves; a list that starts to
  scroll does not shift sideways.

## Workflow follow-up

- Add to `CHANGELOG.md` under "Improved": the Mini-Me editor opens on Appearance, offers
  sixteen colours and a Random button; content no longer shifts when a scrollbar appears.
- Archive the change (`/opsx:archive`), syncing its delta into `openspec/specs/`.
- Open the pull request into `dev`.
