# Proposal

## Why

Everything Mini-Me will do (streaming answers, attaching files, reacting, running Mini-Mes,
showing Interactive Components) travels as events and is stored in a Project. The event
protocol and the storage layer are the foundation every later change builds on, and they can
be built and verified on their own, before any AI exists in the app. Getting the envelope
right now (stable IDs, ordering, origin) keeps future collaboration possible without a
redesign.

## What Changes

- Define the **event envelope** shared by every part of the app: UUIDv7 event ID, event type,
  envelope version, Project and Conversation IDs, a per-Conversation sequence number assigned
  by the Rust core, a timestamp, the origin (installation and user) and a typed payload.
- Define the first **event types**: `message.created`, `message.delta`, `message.completed`,
  `message.failed`, `message.cancelled`, `attachment.added`, `reaction.added` and
  `reaction.removed`.
- Guarantee that the Rust core **persists every event before delivering it**, delivers events
  in sequence order, and lets the UI catch up from any sequence number.
- Create the **Mini-Me Data** folder, with one folder per **Project** containing
  `project.sqlite` and `assets/`. Projects can be created, listed and opened.
- Add **Conversations** inside a Project: create, list, open with full history, send a
  message, stop a reply in progress, and react to messages. Messages cannot be edited.
- Add the **Asset** registry: files attached to a message are copied into the Project and
  addressed by a stable ID.
- Add **Text Components** for Assets: typing `#` in the composer references an Asset in the
  Project; the reference travels with the message as a typed ID and renders as a chip.
- Connect the UI and the Rust core through Tauri IPC (commands for actions, channels for the
  event stream).
- Add a **temporary echo responder** in the Rust core that streams the user's text back as a
  reply, so streaming, cancellation and recovery can be exercised before the sidecar exists.
- Replace the template UI with a minimal functional UI: Project picker, Conversation list and
  chat view.

## Capabilities

### New Capabilities

- `event-protocol`: the event envelope, sequence ordering, persist-before-deliver, catch-up
  and forward compatibility rules that every event in the app follows.
- `projects`: the Mini-Me Data folder, Project folders and their lifecycle (create, list,
  open), installation and user identity, and Project-folder confinement.
- `conversations`: Conversations inside a Project, the message model and lifecycle, message
  events, replies streamed into a single message, cancellation, reactions and Text
  Components.
- `assets`: the per-Project Asset registry, importing files as Assets, attaching them to
  messages and opening them.

### Modified Capabilities

None.

## Out of scope

- The Python sidecar, any LLM call, Traits, Mini-Mes, Workflows and routing (Jev). The echo
  responder is a stand-in and is removed when the sidecar change lands.
- `@` mentions of Mini-Mes, and Text Components that reference Interactive Components or
  selections (only Asset references exist in this change).
- Interactive Components and the Project Overview.
- Renaming or deleting Projects and Conversations; moving the Mini-Me Data folder.
- Collaboration and the relay server (the envelope is designed for it, nothing more).
- Visual design beyond a clean, functional layout.

## Impact

- **Rust core (`src-tauri`)**: new modules for the protocol, storage, assets, conversations,
  the echo responder and IPC commands; the template `greet` command is removed.
- **Frontend (`src`)**: the template screen is replaced by the Project picker, Conversation
  list and chat view, plus a client-side event store.
- **New dependencies**: Rust crates for SQLite (bundled), UUIDv7 and media-type detection;
  the official Tauri dialog plugin for picking files; Vitest for frontend tests. All work on
  Windows, macOS and Linux with no system-level prerequisites.
- **Files on the user's computer**: a `Mini-Me Data` folder in the user's Documents folder
  and an app settings file in the OS app-config location.
- **External services, credentials, costs**: none.
