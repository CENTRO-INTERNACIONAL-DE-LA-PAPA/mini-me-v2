# Proposal

## Why

A Mini-Me's avatar is drawn from three fixed layers (base, face, accessory), and those three are
written into the part loading, the drawing, the picker, the debug view, the playground, the
core's avatar type and the animation CSS. Adding a layer or a motion means editing all of them,
and every part SVG must be hand-edited to the app's conventions before it works. The parts have
been redrawn in Figma, with each face split into eyes and a mouth, and exported as plain SVGs;
the app should take them as they come and make the next layer or motion cheap to add.

## What Changes

- Avatars are drawn from an ordered list of layers: Base, Eyes, Mouth, Accessory and Held item.
  Base, Eyes and Mouth are required; Accessory and Held item are optional. A layer without parts
  (Held item, for now) is not offered.
- **BREAKING** A Mini-Me's avatar names one part per layer (`base`, `eyes`, `mouth`, and
  optionally `accessory` and `held`) instead of a `base`, a `face` and an `accessory`. The
  built-in Mini-Mes are rewritten to the new parts so they look as before; avatars saved in the
  old form are not converted.
- The parts are the Figma exports as they are: the app turns their placeholder body and freckle
  colours into the Mini-Me's colours, and blinks the shapes the export names `blink`.
- The new bases, eyes, mouths and accessories in the exports join the avatar picker.
- Animations act on layers rather than on parts. Avatars look and move as they do today.

Out of scope:
- A script that imports raw SVGs from a drop folder.
- Art for Held item, and new animations.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mini-mes`: a Mini-Me's avatar names one part per layer.
- `library-editors`: the Appearance tab picks one part per layer.
- `avatar-animation`: blinking follows the eyes part's marked shapes; looking toward the pointer
  moves the Eyes, Mouth and Accessory layers.

## Impact

- UI: `src/components/avatar/` (a new layer registry; `parts.ts`, `Avatar.tsx`, `PartGrid.tsx`,
  `AvatarDebugView.tsx`), `src/components/minime/MiniMeAvatar.tsx`,
  `src/components/library/MiniMeEditor.tsx`, `src/components/home/playground.ts`, the avatar
  rules in `src/index.css` and `src/protocol/types.ts`.
- Assets: `src/assets/avatar/{bases,eyes,mouths,accessories}` hold the exports;
  `src/assets/avatar/faces/` is removed.
- Rust core: `MiniMeAvatar` in `src-tauri/src/library.rs` and every avatar in
  `src-tauri/library/builtin.json`.
