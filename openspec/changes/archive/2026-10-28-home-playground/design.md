# Design

## Context

- Home is rendered by `App.tsx` as `MainSheet` > a scrolling `div` > `HomeView`. `MainSheet`
  is `relative` and clips its content.
- `useMiniMes` returns every Mini-Me in the library, built-in and user-made, with its avatar
  parts and colours; `MiniMeAvatar` draws one as stacked SVG layers.
- `approvals.rs` already reads every Project's `project.sqlite` read-only, skipping
  unreadable and newer databases.
- With no Project open, the sidebar shows only a Home entry.

## Goals / Non-Goals

**Goals:**
- Keep the playground entirely in the UI: it holds no durable state and needs nothing from
  the core besides the Mini-Me list it already gets.
- Keep Home usable: scrolling, clicking and selecting work as before, and the physics costs
  nothing once the pile is still.

**Non-Goals:**
- Pixel-accurate collision shapes for each avatar.

## Decisions

### Physics with Matter.js (UI)
The playground uses Matter.js (`matter-js`, MIT, plain JavaScript, no native code), with
`@types/matter-js` for TypeScript. It runs in the webview on WebView2, WebKit and WebKitGTK
with no system prerequisites, and gives stacking, friction, restitution and sleeping bodies
that a hand-written simulation would have to reimplement.

*Alternative:* a hand-written circle simulation. Rejected: stable piles of 20+ bodies need
iterative constraint solving and sleeping, which is most of what Matter.js is.

Only Matter's engine is used, not its renderer. Each Mini-Me is a circle body roughly the size
of its avatar's body. The bodies are drawn on one 2D `<canvas>`: before the first drop, each
Mini-Me's avatar is drawn once into a bitmap at the screen's pixel density (the base SVG with
its colours written in, since a bitmap cannot read CSS variables, then its face and
accessory), and each frame clears the canvas and copies the bitmaps at the bodies' positions
and angles. The engine advances in fixed 1/60 s steps, as many per frame as the elapsed time
needs (at most four), so motion keeps real time on any display rate.

*Alternative:* absolutely positioned `MiniMeAvatar` elements moved through refs. Tried and
rejected: compositing dozens of rotating SVG layers dropped frames during the fall, and the
canvas did not. *Alternative:* WebGL or WebGPU. Rejected: drawing is no longer the
bottleneck at this scale, and WebKitGTK has no WebGPU.
Each body spawns at a random x across the sheet's width. Static walls sit at the bottom, left and right edges of the sheet and are moved when the sheet
is resized (`ResizeObserver`). Sleeping is enabled and the animation loop stops while every
body sleeps, so a settled pile uses no CPU. Mini-Mes spawn above the top edge, staggered in height, and fall in. With `prefers-reduced-motion: reduce`, the engine is
stepped to rest before the first frame is shown.

### Layering and grabbing (UI)
`App.tsx` renders Home as `MainSheet` > the playground (absolute, filling the sheet, behind)
> the scrolling content. The content keeps its pointer events, so scrolling, clicking and
text selection behave as before. Grabbing works by hit-testing: on `pointerdown` the
playground checks whether the target is inside a card, button, link or field (`closest`); if
not, it asks Matter for a body under the pointer (`Query.point`). A hit starts a drag: a
constraint ties the body to the pointer, the pointer is captured, and releasing removes the
constraint so the body keeps the velocity it had. A press that moves less than a few pixels
and ends quickly counts as a click and shows the name tag instead, which follows the body
and hides after a few seconds or on the next click. A small pure function decides click
versus drag and is tested.

*Alternative:* put the playground above the content with pointer events only on avatars.
Rejected: Mini-Mes would cover cards and buttons, and the user asked for a background.

### When the Mini-Mes appear (Rust core and UI)
The "Show Mini-Mes on Home" flag lives in `settings.json` (the OS app-config folder) as
`home.show_mini_mes`, defaulting to `false`, with `get_home_settings` and
`set_show_home_mini_mes` commands, following `routing.show_answers`. It is an app
preference, not user data, so it stays out of Mini-Me Data. The playground counts the batches asked
for: 0 shows nothing, Home starts at 1 when the flag is on, and each further batch adds every
Mini-Me again on top of the pile, so a Mini-Me can be in the playground more than once. A window `keydown` listener on Home feeds the last keys into a small pure matcher
(tested) for Up, Up, Down, Down, Left, Right, Left, Right, ignoring keys whose target is an
input, textarea, select or editable element; a match increases `round`.

### Recent conversations (Rust core)
The read-only walk over Projects moves from `approvals.rs` into a shared helper in
`projects.rs` that opens each listed Project read-only with a busy timeout, skips newer
schemas and unreadable databases, and hands each connection to a closure. `approvals::list`
uses it, and a new `list_recent_conversations` command uses it to read each Project's
Conversations, merges them, sorts by `last_activity_at` and keeps the newest 5.

### Opening a Conversation in another Project (UI)
`App.tsx`'s `openReply` becomes `openConversation(projectId, conversationId, messageId?)`,
used by Home's Review buttons, the Jobs panel and the Recent group. `AppSidebar` fetches the
recent Conversations whenever Home is shown with no Project open.

## Risks / Trade-offs

- [Many user-made Mini-Mes overfill a small sheet] → every Mini-Me is shown, as asked; the
  pile grows upward behind the content and stays within the side walls.
- [A drag starts when the user meant to select text] → only presses that hit a Mini-Me start
  a drag; elsewhere the press goes to the content as usual.
- [The webview drops frames on slow machines] → bodies sleep once still, and the loop stops
  while all of them sleep.

## Migration Plan

None: no stored data changes. `npm install` picks up the new dependency.
