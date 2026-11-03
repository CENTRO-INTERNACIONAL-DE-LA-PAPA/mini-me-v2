# Proposal

## Why

The sidebar lists each Conversation with only its last-activity time, so the user must open a
Conversation to learn that a reply is still running or waits for their approval. Replies can run
for minutes (Theorist's for twenty or more), and several Conversations can need the user at
once. Issue #60 asks for the state on the row itself.

## What Changes

- The Conversation list the sidebar loads gains a **status** per Conversation, computed by the
  Rust core from the Conversation's latest reply:
  - **running**: the reply's Mini-Me, while its run is in flight;
  - **needs approval**: the reply's Mini-Me, for a reply paused at an approval;
  - none otherwise.
- Each sidebar row shows its status in place of the time while there is one: the working
  Mini-Me's avatar, then "Running" or "Needs your approval", in that Mini-Me's colours, so the
  user sees who is working without opening the Conversation. A Conversation with no status keeps
  its last-activity time.
- Only running and paused replies show a status. A failed or stopped reply, Step numbers and
  unread counts are not shown.
- The sidebar reloads the list whenever the running replies change, so a status appears and
  clears as the reply runs, pauses, resumes and ends, and a paused reply still shows it after a
  restart.
- Home's "Recent" Conversations (across Projects) show the same status line in place of
  "Project · time" only while running or paused; otherwise they keep "Project · time".
- Out of scope: failed, stopped or unread states; Step progress ("Step 2 of 3"); filtering or
  sorting by status; a list of what needs the user across Projects (issue #59); showing status
  anywhere but these two sidebar lists; changing how a reply runs or pauses. No new service,
  credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conversations`: the Conversation list carries each Conversation's status, and the sidebar
  shows it.
- `home`: Recent Conversations carry and show the same status.

## Impact

- Rust core: `conversations.rs` (the list and its status), `recent.rs`, `ipc.rs` (merging the
  running replies into both lists).
- UI: `AppSidebar.tsx`, `App.tsx` (reload on running-reply changes), the TypeScript protocol
  types and a small status-line component.
- Specs: `conversations` and `home`.
- Closes issue #60. No new dependencies, no migration, no change to the event protocol, and no
  change to the report of running replies.
