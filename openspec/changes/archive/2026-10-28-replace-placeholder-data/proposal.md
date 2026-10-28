# Proposal

## Why

Home, the sidebar, Files and a Conversation's side panels show sample data from
`src/placeholders.ts` in development builds and hide those parts in releases, because the
app has no data behind them yet. Each part now gets its real source, or is replaced, so
releases show them and the sample data can be deleted.

## What Changes

- **User profile:** a `user-profile.json` file in Mini-Me Data, next to `user-library.json`,
  holds the user's name. Settings gets a "Your name" field that saves it. The Home greeting,
  the sidebar's Settings button and the "You" initials in Files read the name from there.
  Conversational Onboarding fills the same file later.
- **Waiting on you:** the Rust core lists every reply paused at an approval, across all
  Projects. Home's "Waiting on you" shows them, and each one's button opens its Project and
  Conversation at that reply, where the approval is answered as today.
- **Background jobs:** the Rust core reports which replies are running, in any Project, with
  their Mini-Me, Conversation and current Step, and tells the UI when that changes. A
  Conversation's Jobs panel lists them, the open Conversation's first; clicking one shows
  it. There are no queued, scheduled or recent jobs, and no progress fraction.
- **Conversation Outline:** a new side panel lists what the open Conversation uses, grouped
  as Mini-Mes (`@`), files (`#`) and tables and charts (`$`); clicking an entry scrolls to
  the message where it appears. It replaces the To-do panel, which is removed.
- **Removals:** `src/placeholders.ts`, the `SampleTag` component and every
  `PLACEHOLDER_…` check are deleted. Sections with no data show an empty state instead of
  hiding.

## Capabilities

### New Capabilities
- `user-profile`: the user's profile file in Mini-Me Data, editing the name in Settings, and
  where the name appears in the UI.
- `home`: what Home shows when no Project is open: the greeting and the replies waiting on
  the user's approval across Projects.
- `background-replies`: the core's live list of running replies across Projects and the
  Conversation's Jobs panel that shows them.
- `conversation-outline`: the Conversation's Outline panel of the Mini-Mes, Assets and
  table and chart Interactive Components it uses.

### Modified Capabilities
None. Approvals are still answered in their reply as `workflows` describes; this change only
lists them and links to them.

## Out of scope

- Conversational Onboarding, and anything else in the profile besides the name. The name is
  not sent to the AI model.
- A To-do list of any kind; the To-do panel is removed, not rebuilt.
- Queued, scheduled or recent jobs, progress fractions, and pausing or stopping a reply from
  the Jobs panel (Stop stays in the Conversation).
- A running indicator in the sidebar.
- Answering an approval from Home without opening its Conversation.
- Anything else on Home; it will be decided separately.

No new external service, credential or cost.

## Impact

- Rust core: a new `user_profile` module and commands to read and save the name; a command
  that lists paused approvals by reading each Project's `project.sqlite` read-only; `runs.rs`
  keeps each running reply's current Step and notifies subscribers; new commands to get and
  subscribe to the running replies.
- UI: `HomeView`, `AppSidebar`, `FilesView`, `SettingsView`, `ChatView` and `SidePanels`;
  `App.tsx` opens a Conversation in another Project; a new Outline panel; `src/api.ts` and
  `src/protocol/types.ts` gain the new commands and types.
- Removed: `src/placeholders.ts`, `src/components/minime/SampleTag.tsx`, the To-do panel.
- No database schema change and no protocol event change.
