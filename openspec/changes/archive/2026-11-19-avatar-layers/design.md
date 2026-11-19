# Design

## Context

Avatars are drawn only in the UI. `src/components/avatar/parts.ts` loads three folders with
`import.meta.glob`, inlines bases and faces as SVG markup and draws accessories as `<img>`;
`avatarMarkup` nests them in fixed wrappers (`avatar-react` > `avatar-breathe` > base and
`avatar-head`). The animations in `src/index.css` key on those wrappers and on the `eye` and
`blink` classes inside faces. The core stores a Mini-Me's avatar as `MiniMeAvatar { base, face,
accessory }` (`src-tauri/src/library.rs`) and never checks the ids.

The Figma exports now in `src/assets/avatar/` share one frame (`viewBox="0 0 280 280"`), the
old frame scaled by ten, so they line up exactly as the old parts did. Bodies are filled
`#F5B800`, freckles `#7A5A00`, features `#0A0A0A`; blinking eye shapes have ids starting with
`blink`.

## Goals / Non-Goals

**Goals:**
- One list of layers that every avatar feature reads, so a new layer is one entry and a folder.
- Parts used exactly as exported; no hand edits after export.
- Pixel-identical avatars and identical motion for every built-in Mini-Me.

**Non-Goals:**
- Importing raw SVGs from a drop folder, new motions, Held item art.

## Decisions

These were settled with the user while planning:

- **Layers.** Base, Eyes, Mouth (required), Accessory and Held item (optional), drawn in that
  order. A layer with no parts is left out of the picker, so Held item appears once its folder
  has a file.
- **Eyes and Mouth are separate parts**, exported from Figma as separate files. `quiet`'s
  missing mouth is the part `mouths/mouthless.svg`, not an absent mouth.
- **Blinking is marked in the part.** Shapes whose id starts with `blink` blink; nothing is
  guessed from the drawing.
- **The saved avatar is a map from layer name to part id**, e.g.
  `{ "base": "long", "eyes": "normal", "mouth": "mouthless", "accessory": "bow-tie" }`. The core
  stores it without knowing the layers, so a new layer needs no Rust change. Avatars saved with
  `face` are not converted.
- **Built-in Mini-Mes map to the new parts** as matched from the old faces: amazed → amazed +
  dot, cheerful → normal + smile, content → content + smile, delighted → happy + ecstatic,
  determined → grumpy + neutral, ecstatic → nervous + ecstatic, grumpy → grumpy + sad, joyful →
  happy + smile, neutral → normal + neutral, playful → wink + playful, quiet → normal +
  mouthless, smitten → heart + smitten, smug → smug + smirk.
- **Animations target layers, not parts.**

How it is built, all in the UI except the saved format:

- **Registry.** `src/components/avatar/layers.ts` lists each layer: its name (the key in the
  saved map), its label, whether it is required, and how far it leans toward the pointer. The
  part folders are globbed per layer in `parts.ts`, keyed by layer name; Vite needs literal glob
  patterns, so each layer's glob is written once next to its entry.
- **Adapting exports at load.** Each part's markup is read raw and adapted once: `#F5B800` and
  `#7A5A00` become `var(--avatar-solid, #F5B800)` and `var(--avatar-ink, #7A5A00)` in every
  layer, ids starting with `blink` become `class="blink"` (several avatars on one page would
  otherwise repeat ids), and the root gets `class="size-full"`. Every layer is inlined, so
  accessories take colours and animate like the rest.
- **Drawing.** `avatarMarkup(avatar)` keeps the two motion wrappers (`avatar-react` for the hop,
  `avatar-breathe` for breathing and working) and puts each layer in its own wrapper,
  `<span data-layer="eyes" style="--layer-lean: …">`, in registry order. `Avatar`,
  `MiniMeAvatar` and the playground pass the avatar map instead of separate props.
- **Motion CSS.** The rules in `src/index.css` target `[data-layer]` and read `--layer-lean`:
  a layer moves by `--look-x/y × --layer-lean`, as a percentage of the avatar. The old leans
  convert exactly: eyes 1.6 and mouth 1 of the 28-unit frame become 5.71% and 3.57%; the
  accessory keeps 2%; the base has none. Blink keeps keying on `.blink`. Adding a motion is a
  keyframe rule aimed at layer names.
- **Picker and debug view.** `PartTabs` makes one tab per layer with parts, allowing none for
  optional layers; `AvatarDebugView` builds its defaults and its Randomize from the registry;
  `MiniMeEditor` saves the map as picked.
- **Unknown Mini-Me.** The neutral avatar becomes base `classic`, eyes `normal`, mouth
  `neutral`, in the "off" colours.

## Risks / Trade-offs

- [An export uses the placeholder yellow for something that is not the body] → it takes the
  Mini-Me's colour too; drawings must keep those two colours for body and freckles only.
- [Moving the lean from SVG units to the layer wrapper changes the motion slightly] → the
  percentages are the exact conversion of the old values; the in-app check compares them.
- [Old saved avatars with `face` lose their eyes and mouth] → accepted: there is no old data to
  keep.

## Open Questions

- **Held item's lean.** It has no art yet, so its lean is 0 (it moves with the body) until the
  first held item shows whether it should follow the head. Deferrable: it changes one number in
  the registry.
