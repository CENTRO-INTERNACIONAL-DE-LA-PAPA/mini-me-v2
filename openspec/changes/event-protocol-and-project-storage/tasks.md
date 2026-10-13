# Tasks

## 1. Setup

- [x] 1.1 Add `rusqlite` (bundled), `uuid` (v7, serde), `mime_guess` and `tauri-plugin-dialog` to `src-tauri/Cargo.toml`, register the dialog plugin (opened from Rust, so no frontend permission is needed), and verify `cargo build` succeeds
- [x] 1.2 Add `vitest` to `package.json` with an `npm test` script, and verify `npm test` runs (with no tests yet) and `npm run build` succeeds
- [x] 1.3 Remove the template `greet` command and demo UI, create the empty Rust module layout (`protocol`, `settings`, `projects`, `assets`, `conversations`, `echo`, `ipc`) and verify `npm run tauri dev` opens an empty window

## 2. Protocol types and contract fixture

- [x] 2.1 Define the Rust event envelope, `origin`, message, author, Text Component and all event payload types (`message.*`, `attachment.added`, `reaction.*`) with serde, and the `AppError { code, message }` type; verify with a unit test that an envelope round-trips to the JSON shape in the `event-protocol` spec
- [x] 2.2 Create `protocol/fixtures/events.json` with one example of every event type, and a Rust test that deserializes and re-serializes each entry without loss; verify `cargo test` passes
- [x] 2.3 Write the matching TypeScript types in `src/protocol/types.ts` and verify `npm run build` type-checks

## 3. Settings and Projects

- [x] 3.1 Implement app settings in the app-config directory (create `installation_id` and `user_id` on first launch, keep them on restart, store recently opened Projects); verify with a unit test using a temporary directory that IDs are stable across two loads
- [x] 3.2 Implement data-root creation (`<Documents>/Mini-Me Data`) and Project folder-name sanitization with collision suffixes; verify with unit tests for unsafe characters, Windows reserved names and collisions
- [x] 3.3 Implement `ProjectPaths::resolve` confinement (D7); verify with unit tests that `..`, absolute paths and an escaping symlink are rejected (symlink test skipped where the OS does not allow creating one)
- [x] 3.4 Implement the `project.sqlite` schema as migration 1 (project, conversations, events, messages, reactions, assets tables; WAL) with `user_version` handling; verify with unit tests that a new database migrates, and a database with a higher `user_version` is refused with `schema_too_new` and left unchanged
- [x] 3.5 Implement create, list (ignoring folders without a valid `project.sqlite`, most recently opened first) and open Project; verify with unit tests for name validation (empty, whitespace, over 100 characters) and that an unrelated folder is not listed

## 4. Event store and delivery

- [x] 4.1 Implement `ConversationHub` persistence (D2): assign contiguous `seq`, insert the event and update projections in one transaction, deliver to subscribers only after commit; verify with unit tests that sequences are 1..n per Conversation and independent across Conversations, and that a failed insert is not delivered
- [x] 4.2 Implement subscription with catch-up from `after_seq` (D3); verify with a unit test that replay returns only events after `after_seq`, in order
- [x] 4.3 Implement interrupted-reply recovery on Project open (D10); verify with a unit test that a `streaming` message gets a `message.failed` event with code `interrupted`

## 5. Conversations, Assets and the echo responder

- [x] 5.1 Implement create and list Conversations ordered by last activity; verify with a unit test that a new message moves its Conversation to the top
- [x] 5.2 Implement Asset import (copy to `assets/<asset-id>/<name>`, register with media type and size, original untouched), list with name filter, and path resolution for opening; verify with unit tests that two files named `data.csv` coexist and stored paths are inside `assets/`
- [x] 5.3 Implement `send_message` validation (non-empty text, existing Asset IDs, Text Component kind `asset` with UTF-16 positions inside the content, no reply in progress) and persistence as `message.created`; verify with unit tests for each rejection case
- [x] 5.4 Implement reactions with `reaction.added`/`reaction.removed`, ignoring duplicates; verify with a unit test that adding the same reaction twice persists one event
- [x] 5.5 Implement the echo responder (D9) and `stop_reply`; verify with unit tests that a reply produces `created` → `delta`… → `completed`, and that stopping produces `message.cancelled` with no later deltas

## 6. IPC

- [x] 6.1 Expose the commands and the `subscribe_conversation` channel (D4) with app state holding settings and open Projects; verify by running `npm run tauri dev` and calling `list_projects` from the devtools console

## 7. Frontend

- [x] 7.1 Implement `eventStore` (D11): fold events into messages and reactions, track `last_seq`, ignore `seq <= last_seq` and unknown event types or fields; verify with Vitest tests that load `protocol/fixtures/events.json`, plus tests for deltas, completion, cancellation, duplicates and an unknown type
- [x] 7.2 Build the Project picker (list, create with validation errors, open); verify manually that a created Project appears and its folder exists in Mini-Me Data
- [x] 7.3 Build the Project view with the Conversation list and chat view subscribed through the event store; verify manually that history loads after a restart
- [x] 7.4 Build the composer: send, stop while a reply is streaming, attach files through the dialog, `#` Asset suggestions inserted as tracked references (D8); verify the reference-range logic with Vitest tests (insert, edit inside a reference drops it) and the rest manually
- [x] 7.5 Render messages with status (streaming, stopped, failed), attachments that open with the default app, Text Component chips and reaction toggles; verify manually against the scenarios in the `conversations` and `assets` specs

## 8. Integration check

- [x] 8.1 Run `cargo test` and `npm test` and confirm both pass
- [x] 8.2 Walk through end to end in `npm run tauri dev`: create a Project, create a Conversation, attach a file, reference it with `#`, send, watch the echo stream, stop a second reply, react, close the app mid-reply, reopen and confirm the reply shows as failed and all history is intact

## Workflow follow-up

- Archive the change after review so its specs move to `openspec/specs/`.
