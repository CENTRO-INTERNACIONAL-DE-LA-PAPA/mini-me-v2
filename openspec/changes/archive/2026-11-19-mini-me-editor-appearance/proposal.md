# Proposal

## Why

The Mini-Me editor opens on the Workflow tab, though a new Mini-Me starts with its name, which
is on the Appearance tab, last in the row. Its colour picker offers eight families, leaving wide
gaps around the wheel, and building a look means picking every part by hand. Across the app,
content also shifts sideways when a scrollbar appears.

## What Changes

- The Mini-Me editor's tabs read Appearance, Workflow, Traits, and the editor opens on
  Appearance.
- The colour picker offers sixteen colour families, ordered by hue: the eight current ones and
  Rose, Amber, Lime, Mint, Sky, Indigo, Orchid and Magenta, in the same tone as the hue slider.
- A Random button with a dice icon, next to the avatar preview, picks a random part for every
  layer and a random colour family. Name, description and group stay as they are.
- Every scrolling area keeps room for its scrollbar, so nothing shifts when one appears.

Out of scope: other changes to the editor, and new colour tones.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `library-editors`: the Mini-Me editor's tab order and opening tab, sixteen colour families,
  and a Random look.

## Impact

- UI: `src/components/library/MiniMeEditor.tsx`, `src/components/avatar/palette.ts`,
  `src/components/avatar/ColorPicker.tsx`, `src/components/avatar/AvatarDebugView.tsx` (shares
  the random look) and `src/index.css`.
- No core, sidecar or protocol change.
