# Tasks

## 1. Core

- [x] 1.1 Make `MiniMeAvatar` in `src-tauri/src/library.rs` a map from layer name to part id
  and rewrite every avatar in `library/builtin.json` with `base`, `eyes`, `mouth` and its
  `accessory`, using the face mapping in design.md. Verify: `cd src-tauri && cargo test`
  passes.

## 2. Loading and drawing

- [x] 2.1 Add the layer registry `src/components/avatar/layers.ts` and rewrite `parts.ts` to
  load each layer's folder and adapt every export as design.md describes (placeholder colours,
  `blink` ids, root class); change the avatar type in `src/protocol/types.ts` to the map.
  Update `parts.test.ts` to check every layer's parts load, every adapted base takes the
  avatar colours, and every built-in Mini-Me names an existing part for each required layer.
  Verify: `npx tsc --noEmit` shows only the errors of callers 2.2 updates, and
  `npm test -- parts` passes.
- [x] 2.2 Draw avatars from the registry: `avatarMarkup` puts each layer in a `data-layer`
  wrapper with its `--layer-lean`; `Avatar`, `MiniMeAvatar` (with the new neutral avatar) and
  `playground.ts` pass the avatar map; the look rules in `src/index.css` move layers by
  `--layer-lean`. Verify: `npx tsc --noEmit` is clean apart from 2.3's callers.
- [x] 2.3 Build `PartTabs`, `AvatarDebugView` and the Mini-Me editor's Appearance tab from the
  registry: one tab per layer with parts, none allowed for optional layers. Verify:
  `npx tsc --noEmit` is clean and `npm test` passes.

## 3. Check

- [x] 3.1 In the app: every built-in Mini-Me looks as before in the Library, replies and the
  playground, at 16, 56 and 150 px; open eyes blink, closed eyes and `heart`, `tired`, `sly`,
  `starry-eyed` don't; eyes lean most, mouth less, accessory least; hop, breathe and working
  play as before; reduced motion keeps them still. In the Appearance tab, the new parts are
  offered, Held item is not, and a new Mini-Me saves and reloads its avatar.

## Workflow follow-up

- Add to `CHANGELOG.md`: under "New", more bases, eyes, mouths and accessories to build a
  Mini-Me's avatar from; avatars now pick eyes and a mouth separately.
- Archive the change (`/opsx:archive`), syncing its deltas into `openspec/specs/`.
- Open the pull request into `dev`.
