# Tasks

## 1. Status in the Conversation lists (Rust core)

- [x] 1.1 In `approvals.rs`, add a function that reads, on a connection, the Mini-Me of each
  Conversation's paused reply, sharing the existing query's parsing. Verify with a Rust unit test:
  a paused reply gives its Mini-Me, and an answered one gives nothing.
- [x] 1.2 In `conversations.rs`, add `ConversationStatus` (`running` or `needs_approval`, with the
  Mini-Me) and `status: Option<ConversationStatus>` on `ConversationSummary`; `list` sets
  `needs_approval` from 1.1. Verify with a Rust unit test: a Conversation with a paused reply
  has `needs_approval`, one with a completed, failed or cancelled reply has none.
- [x] 1.3 In `recent.rs`, add `status` to `RecentConversation` from the same function, giving
  none when the paused-reply read fails. Verify with a Rust unit test over two Projects, one with
  a paused reply.

## 2. Running replies in both lists (Rust core)

- [x] 2.1 Add a pure function that overlays `Runs::running()` onto the statuses of a list: by
  Conversation for a Project's list, by Project and Conversation for Recent. Call it from
  `list_conversations` and `list_recent_conversations` in `ipc.rs`. Verify with a Rust unit test:
  a running reply sets `running` with its Mini-Me, a Conversation without one is unchanged, and
  one that is paused is not overwritten.
- [x] 2.2 Read where `runs.rs` pauses a run and notifies the running list; make sure the paused
  reply is persisted before the notification. Verify by reading the order in the code, with a
  Rust unit test if the order had to change.

## 3. Showing the status (UI)

- [x] 3.1 Add `ConversationStatus` and the `status` fields to `ConversationSummary` and
  `RecentConversation` in `src/protocol/types.ts`. Verify with `npx tsc --noEmit`.
- [x] 3.2 Add a function for the status text ("Running", "Needs your approval") and the
  `ConversationStatusLine` component (avatar, then text in the Mini-Me's ink). Verify with a
  frontend test of the text function.
- [x] 3.3 In `AppSidebar.tsx`, show the status line in place of the time on a Project's
  Conversation rows, and in place of "Project · time" on Recent rows, only while there is a
  status. Verify by viewing both lists with a running and a paused reply.
- [x] 3.4 In `App.tsx`, reload the Conversation list when the set of running replies changes, and
  reload Recent on the same change. Verify by starting a reply, watching its row change to
  "Running", pausing it at an approval, approving it and letting it finish, in the sidebar and on
  Home.
- [x] 3.5 Add the status line to `DESIGN.md`'s sidebar section. Verify by reading it.

## Workflow follow-up

- Run the Rust, frontend and sidecar tests, and have the user verify the sidebar and Home in the
  app.
- Archive the change (`/opsx:archive`), syncing its delta specs into `openspec/specs/`.
- Open the pull request into `dev` with "Closes #60".
