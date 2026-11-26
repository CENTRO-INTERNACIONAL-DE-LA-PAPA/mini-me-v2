# Design

## Context

`MiniMeEditor.tsx` keeps the open tab in state, starting at `"workflow"`, and lists the tabs as
Workflow, Traits, Appearance. `palette.ts` holds eight `COLOR_FAMILIES`: four with hand-tuned
values and four from `colorForHue`, the hue slider's tone. `AvatarDebugView` already has a
Randomize that picks a part per layer from the registry and a colour family.

## Goals / Non-Goals

**Goals:**
- The editor starts where a Mini-Me starts: its name and look.
- More colours without leaving DESIGN.md's tone range.

**Non-Goals:**
- New tones, or changing the existing families' values.

## Decisions

These were settled with the user while planning:

- **Appearance first, always.** The tab order is Appearance, Workflow, Traits, and every
  Mini-Me, new or existing, opens on Appearance.
- **Sixteen families on the wheel.** The new ones come from `colorForHue`, so they share the
  hue slider's tone, inside DESIGN.md's range: Rose 12, Amber 70, Lime 120, Mint 180, Sky 228,
  Indigo 266, Orchid 305 and Magenta 328. `COLOR_FAMILIES` is kept in hue order, so the
  swatches are too.
- **Random rolls look and colour.** A part for each layer with parts, optional layers empty a
  quarter of the time as in the debug view, and a colour family. The button uses Lucide's
  `DicesIcon`, beside the avatar preview.
- **`scrollbar-gutter: stable` everywhere.** One base rule in `src/index.css` for all
  elements; the property only acts on elements that can scroll, so it covers every scrolling
  area.

How it is built:

- **One random look.** The debug view's roll moves to a `randomAvatar()` in `parts.ts`
  (parts) and a `randomFamily()` in `palette.ts`, used by both the debug view and the editor,
  so the roll is written once.
- **Editor.** The Random button sets the draft's avatar and colours as picking a part and a
  swatch do, so Save and the preview need nothing new.

## Risks / Trade-offs

- [The reserved gutter leaves an empty strip where scrollbars take room (Windows, or
  "always show scrollbars")] → accepted: a stable layout matters more.
- [Sixteen swatches need two rows in the 200 px column] → the swatches already wrap.
