# Design

## Context

The sidebar's Conversation list comes from `list_conversations` (`conversations::list`), which
returns each Conversation's ID, title and times. Home's "Recent" group comes from
`list_recent_conversations` (`recent::list`), which reads every Project's database read-only.

Two sources already know what a reply is doing:
- the Rust core's `Runs` keeps every run in flight in memory and reports them, with their
  Conversation and Mini-Me, to the UI (`useRunningReplies`), which receives the whole list each
  time a run starts, resumes or stops running;
- a reply paused at an approval is stored in the Project's database (`paused_runs`), and
  `approvals.rs` already reads those rows, with the run's Mini-Me, for Home's "Waiting on you".

A paused reply is not in the running report, and a run does not survive a restart, so the two
sources do not overlap. The sidebar rows currently show `formatRelative(last_activity_at)`; Home's
Recent rows show "Project · time". See proposal.md for the scope, and the specs for behaviour.

## Goals / Non-Goals

**Goals:**
- One status per Conversation, computed in the Rust core, in both lists.
- The status follows the reply without polling, and a paused reply keeps it across a restart.
- One status line, used by both lists.

**Non-Goals:**
- A new protocol event, a new stored column or a new table: the status is derived on read.
- Step progress, failed or stopped states, unread counts (see proposal.md).
- Changing `Runs`, the running-replies report or how a reply pauses.

## Decisions

**The status is a derived value on the existing lists.** `ConversationSummary` and
`RecentConversation` each gain `status: Option<ConversationStatus>`, serialised as
`{ kind: "running" | "needs_approval", mini_me: { id, name } }` or `null`. It is never stored,
so there is nothing to migrate or keep in step. *Alternative:* the UI merges the list, the
running replies and the paused approvals itself; rejected because three feeds would have to be
kept in step in React, and the Recent list covers other Projects.

**Paused comes from the database, running from `Runs`.** The Rust core owns both and decides
precedence in one place:
- `approvals.rs` gains a small function that reads, on a given connection, the Mini-Me of each
  Conversation's paused reply. `conversations::list` uses it on the open Project's connection and
  `recent.rs` on its read-only one, so the same SQL serves both and a paused reply is still found
  after a restart.
- `running` is overlaid by `ipc.rs` from `Runs::running()`, which already carries the Conversation
  and the Mini-Me. A pure function takes the list's statuses and the running replies and returns
  the lists with `running` set, so it can be tested without a Project. `conversations.rs` keeps
  no dependency on `Runs`. *Alternative:* passing `Runs` into `conversations::list`; rejected as it
  couples the storage module to the run manager.

**The sidebar reloads when the running replies change.** `App` already holds the Conversation
list and `refreshConversations`; it calls it when the running replies' set changes (a signature of
their message IDs, so a Step change alone does not reload). Home's Recent group reloads on the same
signature. A pause removes the reply from the running report and a resume adds it back, so
`needs_approval` appears and clears through the same trigger. *Alternative:* polling on a timer;
rejected, as the running report already tells the UI exactly when to look.

**One status-line component.** `ConversationStatusLine` renders the Mini-Me's avatar (16px,
through `MiniMeAvatar`, which draws a neutral avatar for an unknown Mini-Me) and the text, "Running"
or "Needs your approval", in the Mini-Me's ink (`colors.ink`) with the type token `text-meta`. The
Mini-Me comes from `useMiniMes()` by the status's ID. The avatar replaces the issue's coloured dot,
since it already carries the Mini-Me's colours and says who is working. The label text lives in
a small function so it can be tested.

**UI ownership.** The Rust core computes status and decides when it exists; the UI only renders
what it receives and chooses when to reload. The sidecar is not involved.

## Risks / Trade-offs

- [The reload may run before a pause is stored, so `needs_approval` does not show until the next
  change] → check in `runs.rs` that the paused reply is persisted before the running list is
  notified, and reorder if it is not; a task covers this.
- [Recent reads each Project read-only, and a Project whose schema is older than `paused_runs`
  would make `read_each` skip its Conversations entirely] → in `recent.rs`, a failed paused-reply
  read gives no status instead of an error.
- [`refreshConversations` also reloads the file count, so each reload does a little extra work]
  → acceptable: it runs only when a reply starts, pauses, resumes or ends.
- [A Mini-Me deleted while its reply runs] → the status keeps its ID and name, and the avatar is
  the neutral one.
