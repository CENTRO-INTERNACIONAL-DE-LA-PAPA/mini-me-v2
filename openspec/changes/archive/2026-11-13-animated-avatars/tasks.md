# Tasks

## 1. One avatar markup, with inlined faces

- [x] 1.1 Tag every eye path (brows and lashes included) with `class="eye"` in
  `src/assets/avatar/faces/`, adding `blink` to round open eyes. Verify on the Avatars page that
  every face draws as before.
- [x] 1.2 In `parts.ts`, load faces as raw markup like bases, and add `avatarMarkup(style)`,
  which returns the base layer and a head layer holding the face and the accessory. Make
  `Avatar` render it, and make the playground's `avatar()` use it instead of building layers
  itself. Extend `parts.test.ts` so every face loads as markup. Verify with `npm test`,
  `npx tsc --noEmit`, and that avatars look unchanged in the library, sidebar, editor and
  playground.

## 2. Idle life, reactions and small avatars

- [x] 2.1 Add the avatar keyframes and classes to `src/index.css`: blinking on `.eye`,
  breathing, the click hop, the per-avatar random
  `--avatar-delay`, `avatar-small` (blink only), and `animation: none` under reduced motion.
  Have `Avatar` set the delay and `avatar-small` below 40 px, and start the hop on click.
  Verify in the app that Scribe blinks and Explorer doesn't, that avatars blink out of step, that
  a 150 px avatar hops on click and doesn't move on hover, that pills only blink, and that nothing
  moves with reduced motion on.
- [x] 2.2 In the playground, start the hop in the click branch that shows the name. Verify in the
  app that a click hops a playground Mini-Me and still shows its name.

## 3. Looking toward the pointer

- [x] 3.1 Add `src/components/avatar/look.ts`:
  - the pure `lookOffset(pointer, rect)`;
  - `trackLook(element)` with one frame-throttled window listener that runs only while
    elements are registered and while reduced motion is off;
  - offsets reset when the pointer leaves the window.

  Add `look.test.ts` for `lookOffset`: direction, clamping, and the centre giving 0. Verify with
  `npm test`.
- [x] 3.2 Register avatars of 40 px or more from `Avatar`, and every playground piece, and move
  the eyes, mouth and accessory by `--look-x`/`--look-y` by decreasing amounts. Verify in the app
  that the editor's avatar and the playground Mini-Mes look toward the pointer with the eyes
  leaning most, the mouth less and the accessory least, that they
  recentre when the pointer leaves the window, and that toggling reduced motion stops and
  restarts it without a restart.

## 4. The working animation

- [x] 4.1 Add `working` to `Avatar` and `MiniMeAvatar`, with its CSS animation (off under
  reduced motion). Pass it from `MessageItem` while the reply streams, and from
  `ConversationStatusLine` while the status is running. Draw the reply header's avatar at 40 px
  (20 px when compact) so it reacts. Verify in the app that during a reply
  both avatars play it and a pill of the same Mini-Me doesn't, that it stops when the reply ends
  or pauses for approval, and `npx tsc --noEmit`.

## 5. Release notes

- [x] 5.1 Add a line under "New" in `CHANGELOG.md`. Verify `npm run check-version` still passes.

## Workflow follow-up

- Archive the change after the user has checked it in the app.
- Ask before opening the pull request into `dev`.
