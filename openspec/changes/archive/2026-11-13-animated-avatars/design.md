# Design

## Context

- **How an avatar is drawn:** `Avatar` (`src/components/avatar/Avatar.tsx`) stacks three
  layers that share the viewBox `-2 -4 28 28`:
  - the base, inlined from its raw SVG so the CSS colour variables reach it;
  - the face and the accessory, each an `<img>`, so CSS cannot reach their parts.
- **The playground draws avatars separately:** `playground.ts` builds the same layers as plain
  DOM in its own `avatar()` function, because its pieces are moved by matter-js outside React.
  A piece takes clicks through a hit test on the sheet (`Query.point`), not through its own
  element.
- **The parts:**
  - Each face is 2 to 7 hard-coded paths with no ids or `<defs>`.
  - Open eyes are filled circles (quiet, cheerful, neutral and others). Closed eyes are arcs or
    lines (joyful, content, smug and others).
- **Where avatars appear, and at what size:**
  - most in-app avatars are 16–28 px (pills, reply headers, sidebar, workflow canvas);
  - the larger ones are the playground (64 px), the editor (48 and 150 px), the part pickers
    (60 px) and the library (56 px).
- **Where the working state is known:** a streaming reply has `message.status === "streaming"`,
  and the sidebar's status line has `status.kind === "running"`.

## Goals / Non-Goals

**Goals:**
- One avatar renderer for React and the playground, so animation is written once.
- Animation in CSS. JavaScript only tracks the pointer and starts the click hop.
- No per-frame work for avatars that don't look at the pointer (all small ones).

**Non-Goals:**
- Changing what any click does, or the playground's physics.
- Animating accessories on their own; they move with the head.

## Decisions

### 1. One markup builder for both renderers
`parts.ts` gains `avatarMarkup(style)`, which returns the avatar's inner HTML: the base layer, then a
"head" layer holding the inlined face and the accessory `<img>`. `Avatar` renders it with
`dangerouslySetInnerHTML`, and the playground sets it as `innerHTML`. The playground's `avatar()`
then only sets the size and colour variables.
- **Alternative: keep both renderers and add the animation to each.** That writes the same
  layering twice, which CLAUDE.md rules out.
- **Alternative: mount a React root per playground piece.** That adds a React tree per body for
  no gain.
- **Why it is safe:** the markup comes only from bundled part files, never from user input, as
  for bases today.

### 2. Faces are inlined, and eyes are tagged
Each face's raw SVG is loaded like the bases' (`?raw` glob). Every eye path, brows and lashes
included, gets `class="eye"`; everything else in a face is the mouth. Round open eyes also get
`blink`. A face with no `.blink` never blinks, so "which faces blink" lives in the part files and
needs no list in code.

Blinking is a `scaleY` keyframe on `.blink` with `transform-box: fill-box; transform-origin:
center`, so each eye closes about its own centre. The accessory stays an `<img>`, because nothing
inside it is animated.

### 3. Layers and what moves each
- **The outer element:**
  - breathes: a slow `translateY`/`scaleY` loop, anchored at the bottom;
  - plays the click hop: a one-shot class removed on `animationend`;
  - plays the working animation: a faster bob with a small wobble, from a `working` class.
- **The head layer** (face and accessory) holds the features that look at the pointer. Each one
  is moved by `--look-x` and `--look-y`, a direction of length 0 to 1, times its own distance:
  - the eyes 1.6 viewBox units;
  - the mouth 1 unit;
  - the accessory 2% of the avatar.

  The different amounts make the head seem to turn. The features use the CSS `translate`
  property, which leaves `transform` free for the blink.
- **Out of step:** each avatar gets a random `--avatar-delay`, chosen once when it is created and
  used as a negative `animation-delay`, so avatars don't blink or breathe together.
- **Small avatars:** an avatar under 40 px gets an `avatar-small` class. The stylesheet limits it
  to blinking and the working animation, and it is never registered for looking.

### 4. One pointer tracker for every avatar that looks
`src/components/avatar/look.ts` holds one `pointermove`/`pointerleave` listener on `window`,
throttled to one update per animation frame, and a set of registered avatar elements:
- `trackLook(element)` registers an element and returns the function that unregisters it.
- `Avatar` calls it in an effect when its size is 40 px or more. The playground calls it for
  each piece.
- On each frame, every registered element's offset is computed by the pure
  `lookOffset(pointer, rect)`: the direction from the avatar's centre to the pointer, growing
  with distance up to length 1. The offset is written to the element as `--look-x` and
  `--look-y`.
- When the pointer leaves the window, the offsets go back to 0.
- The listener is attached only while at least one element is registered.

**Alternative: a listener per avatar.** That means dozens of listeners in the playground and
library, and one `getBoundingClientRect` each per event instead of per frame.

### 5. The playground's click
Playground pieces sit behind the sheet's content and their presses are hit-tested, so the
playground adds the hop class in the click branch that already shows the name.

### 6. The working state is a prop
`Avatar` and `MiniMeAvatar` take `working?: boolean`, which adds the `working` class:
- `MessageItem` passes `message.status === "streaming"` for the header avatar;
- `ConversationStatusLine` passes `status.kind === "running"`.

No other avatar gets it, so a pill of the same Mini-Me stays idle.

### 7. Reduced motion
- **The stylesheet:** every avatar animation rule is inside
  `@media (prefers-reduced-motion: no-preference)`, so under reduced motion none apply.
- **The tracker:** it reads `matchMedia("(prefers-reduced-motion: reduce)")` and listens for
  its `change` event. While reduced motion is on, it detaches the pointer listener and resets
  the offsets. This makes changes take effect without a restart.

### 8. Where the CSS lives
The keyframes and the avatar classes go in `src/index.css`, next to the other global styles. The
classes are on markup built outside React (the playground), so they can't be component-scoped
Tailwind utilities alone.

## Risks / Trade-offs

- **Many inline SVGs instead of `<img>`:** every avatar inlines its face, a few hundred bytes of
  DOM each. Lists of avatars are short, so this is negligible.
- **Layout reads on every frame:** the tracker calls `getBoundingClientRect` once per frame for
  each looking avatar, which costs time in the playground (around 30 pieces). Small avatars are
  never registered, and reading all rects before writing any variables avoids layout thrash.
- **Animations stealing attention:** breathing and blinking are slow and small, and they are off
  under reduced motion. The working animation is the only fast one, and it only plays while a
  reply streams.
- **Overflow:** a hop can move an avatar outside its box and get clipped by
  `overflow: hidden` parents, such as sidebar rows. Small avatars don't hop, and the
  working bob stays within a pixel or two.

## Open Questions

- **Exact timings and distances:** blink interval, breathing period, hop height and how far the
  head leans. To be tuned on the Avatars page in Developer mode, which shows every size.
