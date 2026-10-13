# Design

## Context

The repository is the stock Tauri 2 + React 19 + Vite template: one `greet` command in
`src-tauri/src/lib.rs`, a demo `App.tsx`, the `opener` plugin, and no tests or test runner.
There is no sidecar yet. See proposal.md for motivation and the specs in this change for the
required behavior.

This change involves two processes: the **React UI** and the **Rust core**. The Rust core
owns all durable state (settings, Project databases, Asset files, the event log) and all
filesystem access. The UI holds only a view of the event stream.

## Goals / Non-Goals

**Goals:**
- One event envelope and one delivery path that later changes reuse unchanged: the sidecar
  change only adds a new event producer.
- Storage that can be inspected with any SQLite tool and survives crashes mid-reply.
- A contract test so the Rust and TypeScript sides cannot silently disagree on the protocol.

**Non-Goals:**
- Performance tuning for very long Conversations (paging, compaction of delta events).
- Generated TypeScript types from Rust.
- Any visual design system.

## Decisions

### D1. Event log is the source of truth; messages are a projection
Each `project.sqlite` has an append-only `events` table (one row per event, with the
envelope columns and the payload as JSON) plus `messages`, `reactions` and
`conversations` tables that the core updates **in the same transaction** as the event
insert. The UI rebuilds state from events; the projection tables exist for fast listing
(Conversation list ordering, the "streaming on open" recovery query) and future features
(Project Overview, search).
- *Alternative:* store only messages and derive events on the fly. Rejected: catch-up and
  future collaboration need the exact event history.
- *Alternative:* events only, no projection. Rejected: recovery and list queries would
  replay whole Conversations.

### D2. Sequence assignment and delivery under one per-Project lock
Each open Project holds its SQLite connection and its subscriber lists behind one mutex.
Persisting an event is: lock → read the Conversation's `last_seq` → insert event + projection
+ new `last_seq` in one SQLite transaction → on commit, send to the Conversation's
subscribers → unlock. Sending inside the lock guarantees delivery order equals `seq` order and
that a failed insert is never delivered (spec: Persist before deliver). Subscribers whose
channel fails are dropped.
- *Alternative:* one lock per Conversation. Rejected for now: SQLite allows one writer per
  database anyway, so finer locks add bookkeeping without adding throughput.

### D3. Catch-up without gaps or duplicates
`subscribe_conversation(conversation_id, after_seq, channel)` takes the Project lock, sends
every stored event with `seq > after_seq`, registers the channel, and releases the lock. No
event can be persisted in between, so nothing is missed or sent twice. The UI's event store
still applies only the event whose `seq` is exactly `last_seq + 1`, which makes repeated
subscriptions (for example on reload) harmless.
- *Alternative:* register first and replay without the lock. Rejected: it needs duplicate
  filtering in every subscriber, and replays are short at this stage.

### D4. IPC shape
- **Commands** (request/response, `Result<T, AppError>`): `list_projects`, `create_project`,
  `open_project`, `list_conversations`, `create_conversation`, `send_message`,
  `stop_reply`, `add_reaction`, `remove_reaction`, `import_assets`, `list_assets`,
  `open_asset`.
- **Channels**: `subscribe_conversation` takes a `tauri::ipc::Channel<Event>`; the event
  stream for a Conversation only ever flows through it.
- Errors are a serializable `AppError { code, message }` with stable codes
  (`invalid_name`, `invalid_input`, `not_found`, `reply_in_progress`, `reply_finished`, `confinement`, `schema_too_new`,
  `storage`…) so the UI can show specific messages.
- *Alternative:* Tauri global events (`emit`). Rejected: no per-subscriber ordering
  guarantee and no backpressure; channels are designed for ordered streams.

### D5. Storage layout and settings
- Data root: `<Documents>/Mini-Me Data`, resolved with Tauri's path API.
- App settings (`installation_id`, `user_id`, `data_root`, recently opened Projects) are a
  JSON file in Tauri's app-config directory, never inside Mini-Me Data, so Project folders
  stay self-contained and portable.
- Project folder: `project.sqlite` (WAL mode), `assets/<asset-id>/<original file name>`.
  One folder per Asset avoids name collisions and keeps the original name for the user.
- Folder names: Project name with `<>:"/\|?*` and control characters replaced by `-`,
  trailing dots/spaces trimmed, Windows reserved names (`CON`, `NUL`…) suffixed, then
  ` (2)`, ` (3)`… on collision.
- A Project is listed when its folder contains a `project.sqlite` with a readable
  `project` row; anything else is ignored.

### D6. Schema migrations
`PRAGMA user_version` holds the schema version. On open: equal → open; lower → run ordered
migrations in one transaction; higher → refuse with `schema_too_new` without writing. The
initial schema is migration 1. No migration library: the list is short and the pragma is
enough.

### D7. Path confinement in one function
All Project file access goes through `ProjectPaths::resolve(relative)`, which rejects
absolute paths and `..`, joins onto the canonicalized Project root, canonicalizes the
result (or its parent for files about to be created) and checks it still starts with the
root. This also catches symbolic links that escape. The import command is the only code that
reads a path outside the Project, and only the paths returned by the file dialog, which
the Rust core opens itself (`import_assets`) so the UI can never supply a path.

### D8. Text Component positions
`start`/`end` are offsets in **UTF-16 code units** into `content`, because the composer
(JavaScript) is where references are authored. The core validates them by encoding the
content as UTF-16. In the composer the reference is inserted as its label text (for example
`#field-trial.csv`) and tracked as a range; if the user edits inside that range, the
reference is dropped and the text stays plain. Sent messages render ranges as chips.

### D9. Temporary echo responder
After a user message is persisted, the core spawns a thread that produces the reply as
`author { kind: "system", id: "echo" }`: `message.created` (status `streaming`), the user's
text one word at a time as `message.delta` with a short delay, then `message.completed`.
`stop_reply` persists `message.cancelled`; the producer's next delta is then rejected
because the reply is no longer streaming, and it stops. No separate cancellation token is
needed: the stored status is the single source of truth, for this producer and any later
one. The responder uses only the reply functions in `conversations`, lives in its own
module, and is deleted by the sidecar change.

### D10. "One reply at a time" and recovery use the projection
`send_message` checks the `messages` projection for a `streaming` reply in the Conversation
and returns `reply_in_progress` if one exists. `open_project` queries `streaming` messages
and persists `message.failed { code: "interrupted" }` for each before returning.

### D11. Frontend state
A small framework-free module, `eventStore`, folds events into per-Conversation state
(messages, reactions, `last_seq`) and is unit-tested with Vitest. React components subscribe
to it; no state library is added. TypeScript protocol types are hand-written in one file
that mirrors the Rust types.

### D12. Contract fixture shared by both sides
`protocol/fixtures/events.json` holds one example of every event type. A Rust test
deserializes and re-serializes each one; a Vitest test feeds them to `eventStore`. Changing
the protocol on one side without the other breaks a test.

### Dependencies
All work on Windows, macOS and Linux with no system-level prerequisites:
- `rusqlite` with the `bundled` feature: compiles SQLite into the app, so no system SQLite
  is needed. Chosen over `sqlx` because access is local and synchronous and needs no async
  pool or compile-time database.
- `uuid` with `v7` and `serde`: UUIDv7 generation.
- `mime_guess`: pure-Rust media type from file extension.
- `tauri-plugin-dialog` (official): native file picker for attachments, opened from the
  Rust core, so the frontend needs neither the npm package nor a dialog permission.
- `vitest` (dev, frontend): unit tests; it shares Vite's config.
- Existing `tauri-plugin-opener` opens Assets with the default application.

## Risks / Trade-offs

- [Persisting every `message.delta` grows the events table quickly for long replies] →
  Acceptable for now; WAL keeps writes cheap. A later change can compact deltas once a
  message completes.
- [Sending to channels while holding the hub lock lets a slow UI slow down producers] →
  Channel sends are non-blocking in Tauri; failed channels are dropped.
- [Sequence numbers are assigned locally, so they are only meaningful per installation] →
  Intended: the envelope keeps `seq` separate from `id` and `origin` so a relay can assign
  ordering later without changing event IDs.
- [Hand-written TypeScript types can drift from Rust] → The shared fixture test (D12).
- [Users may move or edit files inside Mini-Me Data manually] → Missing Asset files are
  reported when opened; the registry is not changed automatically.
- [Documents folder synced by OneDrive/iCloud can lock or duplicate SQLite files] →
  Documented as a known risk; making the data root configurable is a later change.

## Migration Plan

No existing data or users. The template `greet` command and demo UI are removed.
