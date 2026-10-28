# Design

## Context

The parts this change fills in read `src/placeholders.ts` today (see proposal.md, Why).
What already exists:

- `user_library.rs` keeps app-wide user data in Mini-Me Data as JSON, written through a
  temporary file and a rename, and refuses edits while the file is unreadable.
- Each Project's `project.sqlite` has a `paused_runs` row for every reply paused at an
  approval. The row's `run` column holds the saved `RunSpec`, which names the Mini-Me, and
  its `component_id` points at the `approval` component, whose `data.prompt` is the question.
- `Runs` (`runs.rs`) holds every run in flight in memory, with its Project, Conversation,
  reply and `RunSpec`. A run is removed when it completes, fails, is cancelled or pauses.
- The sidecar and update statuses reach the UI through `get_*` and `subscribe_*` commands
  with a Tauri `Channel`. A subscriber is dropped once a send to it fails.
- `ChatView` scrolls to a message through its `data-message-id` attribute, and
  `componentNames` names a Conversation's tables and charts.
- Home is shown with no Project open; `App.tsx` opens a Project and then always shows its
  Overview.

## Goals / Non-Goals

**Goals:**
- Keep durable data in the Rust core, and live run state in the core's memory, with the UI
  only reading and subscribing.
- Read other Projects' databases without opening them as working Projects (no migration and
  no recovery of interrupted replies just because Home was shown).

**Non-Goals:**
- No protocol event, database schema or sidecar change.
- No change to how approvals are answered or replies are stopped.

## Decisions

### Profile file (Rust core)
A new `user_profile.rs` module owns `user-profile.json` in the Mini-Me Data folder, opened
once at start-up next to `LibraryStore`. The file is a JSON object; the core reads `name` and
keeps every other key as it is when saving, so Conversational Onboarding can add keys without
a format change. Writes reuse the temporary-file-and-rename approach of `user_library.rs`.
While the file is unreadable, the store keeps the reason and refuses saves, as
`LibraryStore` does. Commands: `get_user_profile` returns `{ name, unreadable }`, and
`save_user_name(name)` validates (trim, at most 100 characters, empty clears the key) and
returns the saved profile.

*Alternative:* `settings.json` in the OS app-config folder. Rejected: the user asked for the
file next to `user-library.json`, and the profile is the user's data, which belongs with
their other data in Documents rather than in app configuration.

The UI reads the profile through a `useUserProfile` hook in `src/hooks/`, built like
`useMiniMes`: one shared request, and a `refreshUserProfile()` that Settings calls after a
save so the sidebar and Files update at once. First name and initials are derived in the UI
by a small pure function.

### Paused approvals (Rust core)
A new command `list_paused_approvals` lists the Projects with `projects::list`, then opens
each `project.sqlite` with `db::open_read_only` and a short busy timeout. It skips a Project
whose `user_version` is newer than the app's migrations, or whose query fails (including
databases from before `paused_runs` existed, which cannot hold paused replies). One query
joins `paused_runs`, `messages`, `conversations` and `components`, and the Mini-Me comes
from the saved run. Results are merged across Projects and sorted by `paused_runs.created_at`,
newest first.

*Alternative:* open every Project through `AppState::project`. Rejected: it migrates
databases and marks interrupted replies as failed as a side effect of looking at Home, and
keeps every Project open.

### Opening a Conversation in another Project (UI)
`App.tsx` gains one function that opens a Project and then shows a given Conversation at a
message, used by Home's Review button and by the Jobs panel. `openProject` takes the view to
show afterwards and keeps the Overview as its default. The Conversation view already accepts
`messageId` and scrolls to it.

### Running replies (Rust core)
`Run` gains `step: Option<String>`, set in `step_started` from the name it already computes.
`Runs` gains a list of subscribers like the sidecar status's, and a `notify` that runs after
a run is inserted in `launch`, after `step_started`, and after a run is removed (`finish` and
the failed start in `launch`). `notify` copies what it needs from the runs while holding the
lock, releases it, then looks up Conversation titles through each Project, so no Project lock
is taken while `Runs` is locked. Each subscriber is sent the whole list; lists are small, and
the UI need not merge updates. Commands: `get_running_replies` and
`subscribe_running_replies(on_change)`.

*Alternative:* new protocol events in each Conversation. Rejected: this is app-wide, transient
status like the sidecar's, it would be persisted and replayed as Conversation history, and a
Conversation's subscribers only see their own Conversation.

*Alternative:* derive running replies from messages with status `streaming`. Rejected: that
needs every Project's database to be read, and the in-memory runs already know the current
Step.

The UI subscribes once through a `useRunningReplies` hook in `src/hooks/`. `ChatView` puts the
open Conversation's reply first and scrolls to it in place when clicked; any other reply goes
through `App.tsx` to its Conversation.

### Outline (UI)
A pure function in `src/components/chat/outline.ts` turns a Conversation's messages and
`componentNames` into the three groups: for each entry, its ID, label and the IDs of the
messages it appears in, in order. It is tested next to the code. `OutlinePanel` in
`SidePanels.tsx` renders it and remembers, per entry, which message it scrolled to last, so
the next click goes to the next one. Scrolling reuses the `data-message-id` lookup that
`ChatView` uses for `messageId`. Mini-Mes come from reply authors and `mini_me` Text
Components; files from attachments and `asset` Text Components; tables and charts from
`table` and `chart` components and `component` Text Components.

### Removals
`placeholders.ts`, `SampleTag.tsx`, `TodoPanel` and the sample-only parts of `JobsPanel`
(queued, scheduled, recent, progress bar, Pause and Stop) are deleted. With no
`PLACEHOLDER_…` checks left, each section always renders and shows an empty state when it has
no data.

## Risks / Trade-offs

- [A Project's database is busy writing while Home reads it] → read-only connection with a
  busy timeout; if it still fails, that Project is skipped for this visit and appears the next
  time Home is shown.
- [Many Projects make Home slower to fill] → one query per Project, run off the UI thread by
  the async command; Home renders and fills "Waiting on you" when the list arrives.
- [Conversation titles in the Jobs list go stale if renamed while running] → titles are read
  on every notify, which happens at least at each Step start.
- [Removing the To-do panel loses its design] → it is in git history and in the Claude Design
  file if a to-do list returns.

## Migration Plan

No schema or file migration: `user-profile.json` is created on the first save, and existing
Projects already store paused runs. Dev builds stop showing sample data; release builds start
showing these sections. Rolling back restores the placeholders and leaves
`user-profile.json` unused.
