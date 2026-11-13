# Proposal

## Why

Mini-Me avatars are still pictures. Animating them makes each Mini-Me feel alive, and it can
show state that today is only in text, such as which Mini-Me is working on a reply (#183).

## What Changes

- Avatars come alive while idle. A face with open eyes blinks now and then, and the avatar
  rises and falls gently as it breathes. Avatars blink and breathe out of step with each other.
- An avatar squashes and hops when it is clicked.
- An avatar's eyes, mouth and accessory lean toward the pointer by decreasing amounts, as if
  the Mini-Me turns its head to look at it.
- The avatar in a reply's header grows from 28 to 40 px, so it is large enough to react.
- A Mini-Me shows a working animation wherever its avatar marks a reply that is streaming:
  the reply's header and the "Running" status under its Conversation in the sidebar.
- All of this is built into the avatar itself, so it applies wherever an avatar is drawn,
  including the Home playground, pills, lists, the Mini-Me editor and the part pickers.
  Avatars under 40 px, such as those in pills and reply headers, only blink and show the
  working animation.
- With the system's reduced-motion setting on, avatars stay still. There is no new Setting.
- The existing SVG parts are animated with CSS. Faces are inlined like bases so their eyes can
  be animated. The parts keep their drawings, and their eye paths are tagged.

Out of scope:
- new avatar parts, or redrawing existing ones;
- the desktop overlay (#182);
- sound;
- an animation per Mini-Me or per Trait;
- a Setting to turn animation off.

There is no new external service, credential, dependency or cost.

## Capabilities

### New Capabilities
- `avatar-animation`: how a Mini-Me's avatar moves: idle blinking and breathing, reactions to
  clicks, looking toward the pointer, the working animation while its reply
  streams, the reduced animation of small avatars, and still avatars under reduced motion.

### Modified Capabilities
None. The avatar parts, colours and the places avatars are shown (`mini-mes`, `home`,
`conversations`) are unchanged; the playground's physics and gestures are unchanged.

## Impact

- UI only. The Rust core and the sidecar are not touched, and no protocol events change.
- `src/components/avatar/`: `Avatar` and `parts.ts` (inlined faces, animation classes and the
  pointer tracking).
- `src/assets/avatar/faces/*.svg`: eye paths are tagged.
- `src/components/home/playground.ts` builds its avatars as the `Avatar` component does, so it
  shares the inlined faces and the animation.
- The places that show a streaming reply's avatar (`MessageItem` and `ConversationStatusLine`)
  pass the working state.
- The global stylesheet gains the keyframes.
