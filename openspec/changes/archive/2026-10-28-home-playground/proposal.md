# Proposal

## Why

Home is mostly empty space and says little about what Mini-Me is. Showing every Mini-Me as a
small crowd the user can play with makes the idea of "little scientists" visible at a glance,
and a list of recent Conversations in the sidebar gives Home a quick way back into work.

## What Changes

- **Mini-Me playground:** a physics layer fills the Home sheet behind its content and shows
  every Mini-Me, built-in and user-made, as its avatar. They drop in with gravity, pile up
  along the bottom and collide with each other and the sheet's edges. The user can grab,
  drag and throw them; a quick click shows the Mini-Me's name. Home's text, cards and
  buttons stay on top and keep working. With reduced motion, the Mini-Mes appear already
  settled.
- **When they appear:** a "Show Mini-Mes on Home" switch on a new Appearance page in
  Settings, off by default, makes them appear each time Home is shown. Pressing Up, Up, Down,
  Down, Left, Right, Left, Right on Home makes them appear whatever the setting says.
- **Recent conversations:** with no Project open, the sidebar lists the 5 most recently
  active Conversations across all Projects, each with its Project's name; clicking one opens
  its Project and Conversation. The Rust core lists them by reading each Project's
  `project.sqlite` read-only.
- **Dependency:** Matter.js for the physics, in the UI only.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `home`: adds the Mini-Me playground behind Home's content, the setting and key sequence
  that make it appear, and the recent Conversations in Home's sidebar.

## Out of scope

- Remembering where the user left the Mini-Mes; each visit starts a new pile.
- Opening a Mini-Me's editor, or any other action, from the playground.
- A playground anywhere other than Home.
- Other sidebar items for Home (setup checklist, "Waiting on you" count, Library entry).

No new external service, credential or cost.

## Impact

- Rust core: a command listing recent Conversations across Projects, next to
  `list_paused_approvals`.
- UI: a playground component under `src/components/home/`, `HomeView`, `App.tsx` (the Home
  sheet hosts the playground and opens a Conversation in another Project), `AppSidebar`,
  `src/api.ts` and `src/protocol/types.ts`.
- Rust core: a `home` section in `settings.json` with the "Show Mini-Mes on Home" flag, and
  commands to read and set it.
- `package.json`: `matter-js` and `@types/matter-js`.
- No database schema, protocol event or sidecar change.
