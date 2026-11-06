# Design

## Context

Jev's answers are stored today as `routing.answered` events (`record_jev_answers` in
`conversations.rs`), and `message_views()` in `store.rs` reads them on every Conversation open
to fill `MessageView.jev`. The UI's `JevAnswersBlock` (`MessageItem.tsx`) draws each answer as
one monospace line. What Jev was asked is built in the sidecar (`_questions()` in
`routing.py`) and never returned. The sidecar log is `sidecar.log` in the app's log directory
(`SidecarLog`, `sidecar.rs`); nothing in the app opens it. The project database is versioned
with `PRAGMA user_version` and a `MIGRATIONS` list (`db.rs`, version 10).

## Goals / Non-Goals

**Goals:**
- One table for every kind of debug record, which reply debugging can add to.
- Opening a Conversation costs nothing extra, however much debug data a Project holds.

**Non-Goals:**
- Showing debug records outside the message they belong to (a list or search of records).

## Decisions

These were settled with the user while planning:
- Debug records get their own table, read only when a block is expanded; Jev's answers move
  there.
- Jev answers stored as `routing.answered` events are deleted, and the event type is retired.
- "[DEBUG] Jev" shows under every user message while a Jev switch is on, and says "Nothing
  recorded for this message" when there is no record.
- Two Jev switches: "[DEBUG] Show Jev's answers" and "[DEBUG] Show what Jev was asked"; each
  part of the record is stored only while its switch is on.
- "Copy as JSON" is always in an expanded block.
- "[DEBUG] Debug data" clears the open Project's records; "[DEBUG] Sidecar log" opens the log
  file in the system's default app.
- The table's key is one record per message and kind; reply debugging adds a `position`
  column for its one record per model call when it needs it.
- The sidecar sends `asked` with every answer, also while its switch is off, and the core
  drops it: it is a few kilobytes, and the sidecar needs no setting.

### The debug table (Rust core)
Migration 10 → 11 adds:

```sql
CREATE TABLE debug_records (
    message_id      TEXT NOT NULL REFERENCES messages(id),
    kind            TEXT NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    content         TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (message_id, kind)
);
CREATE INDEX debug_records_by_conversation ON debug_records(conversation_id);
DELETE FROM events WHERE type = 'routing.answered';
```

`ProjectState` gets `put_debug_record` (insert or replace), `debug_record(message_id, kind)`
and `clear_debug_records()`. Deleting a Conversation deletes its rows next to its events. The
core owns the table; the UI only reads a record or asks to clear them through IPC.

### What Jev was asked (sidecar)
`routing.py` builds `asked = { state, questions }` from the same Choices it sends, so the
record shows exactly what Jev read, and puts it on `route.done` and `route.error`. `asked` is
`null` when the error came before the request (no key). `Runs::route` returns the answers with
`asked`, and `routing.rs` stores the record with the parts whose switch is on.

### Reading and clearing (IPC and UI)
- `get_debug_record(project_id, message_id, kind) -> Option<Value>`, called when a block is
  expanded.
- `clear_debug_records(project_id)`; `SettingsView` receives the open Project's ID from
  `App.tsx` and disables the button without one.
- `open_sidecar_log()` opens `SidecarLog`'s path with the opener plugin, from Rust, and fails
  with "No sidecar log yet." when the file does not exist.
- "Copy as JSON" uses the web clipboard API, `navigator.clipboard.writeText`, so no plugin.

### The block (UI)
`JevAnswersBlock` becomes a collapsed `<details>` that fetches the record on its first open.
A fixed map gives each question ID its plain words. Each question is a row: its words, then
the chosen option and confidence; under them, in `text-muted-foreground` with lower opacity,
the other options and probabilities, highest first. "What Jev was asked" follows, then "Copy
as JSON".

## Risks / Trade-offs

- [An empty block under messages sent before a switch was on] → It says "Nothing recorded for
  this message"; this was chosen over telling the UI when a record is written.
- [The clipboard API might be refused by a platform's web view] → Fall back to showing "Could
  not copy" in the block; the JSON can still be read in the block.

## Migration Plan

Migration 11 runs when a Project opens. Old Jev answers are deleted and cannot be restored; a
Project opened by a newer version refuses to open in an older one, as with every migration.

