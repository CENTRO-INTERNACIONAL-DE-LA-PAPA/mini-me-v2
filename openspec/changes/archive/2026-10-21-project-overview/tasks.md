# Tasks

## 1. Overview storage and queries in the Rust core

- [x] 1.1 Add migration 4 to `src-tauri/src/db.rs` with the single-row `overview` table from the design (`summary`, `summary_at`, `featured_component`) and raise `SCHEMA_VERSION` to 4. Verify: `cd src-tauri && cargo test db` passes, including the existing upgrade test from an older schema and a new check that `overview` exists after upgrading.
- [x] 1.2 Add `src-tauri/src/overview.rs` with `overview(project)` returning the header (Conversation count, latest activity), the summary and its time, the featured component with its data and author, and the outputs (components other than approvals, and `generated` Assets with the Mini-Me and Conversation of the first message that attaches them), newest first, with the titles from the design. Verify: a unit test with two Conversations, a chart, a table, a paper sources component, an approval, an uploaded and a generated Asset checks the counts, the order, that the approval and the upload are left out, and each title.
- [x] 1.3 Add `feature(project, component_id: Option<Uuid>)` that sets or clears the featured component, refusing a component that is not a chart or table with `invalid_input`. Verify: unit tests feature a chart, replace it with a table, clear it, and refuse a paper sources component.
- [x] 1.4 Add `summary_material(project, library)` building the material from the design within its budget, newest Conversation first, leaving out whole Conversations that do not fit. Verify: a unit test checks the `## <title>` and `You:`/Mini-Me name lines, and that with a small budget the oldest Conversation is left out whole.

## 2. Summary request on the link

- [x] 2.1 Add `SummaryStart { summary_id, model, material }` to `CoreFrame` and `SummaryDone` / `SummaryError` to `SidecarFrame` in `src-tauri/src/link.rs`, raise `SIDECAR_PROTOCOL` to 7, and add `Runs::summarize` waiting for the answer like `Runs::route` (timeout 120 s, `sidecar_stopped` when the link closes). Verify: `cargo test` passes with a frame round-trip test for the three frames and the existing handshake tests updated to version 7.
- [x] 2.2 Add `sidecar/src/mini_me_sidecar/summary.py` with a `Summarizer` like `Router`: `secret.get` with `summary_id` as `call_id`, one call through `providers.chat_model` with the system prompt from the design, provider errors and content-filter endings mapped with the `prompt` adapter's functions, and exactly one `summary.done` or `summary.error`. Wire `summary.start` in `app.py` and raise `PROTOCOL` in `link.py` to 7. Verify: `cd sidecar && uv run pytest` passes with a test of the system prompt's text and of a missing `summary_id` being ignored.
- [x] 2.3 Store a written summary with its time in `overview.rs`, keeping the previous one on failure. Verify: a unit test stores a summary and reads it back with `summary_at`, and a failed update leaves it unchanged.

## 3. IPC commands

- [x] 3.1 Add `get_overview`, `feature_component` and `update_overview_summary` to `src-tauri/src/ipc.rs` and register them in `lib.rs`; `update_overview_summary` runs on a blocking thread and fails with `model_not_set` before sending anything when Settings has no model. Add the matching types to `src/protocol/types.ts` and calls to `src/api.ts`. Verify: `cargo test` and `npx tsc --noEmit` pass.

## 4. The Overview screen

- [x] 4.1 Add `{ kind: "overview" }` to `View`, make it the view after opening a Project, and add an "Overview" item above Files in `AppSidebar.tsx`. Verify: `npx tsc --noEmit` passes, and opening a Project shows the Overview item selected.
- [x] 4.2 Add `src/components/OverviewView.tsx`: the header line and title, the summary with "Written <time>" and "Update summary" (busy while writing, the reason on failure, the previous summary kept), the featured component drawn with `InteractiveComponent` and its Mini-Me's name with a remove button, and Latest outputs: six cards, "Show all", "Open Files →", and an empty state. Put the header line and the six-then-all logic in a small module with a test. Verify: `npm test` passes the new test (header text with and without Conversations, six shown then all).
- [x] 4.3 Style the cards to DESIGN.md: a 72px thumbnail in the Mini-Me's tint with a 3px bottom border in its solid colour and a line icon per kind, then the title and "<kind> · <Conversation title>"; the summary as body text; the title as display. Verify: the user checks the Overview in the app.
- [x] 4.4 Open a card's Conversation at its reply: `{ kind: "conversation", id, messageId }` in `View`, and `ChatView` scrolling that reply into view once loaded. Verify: clicking a card in the app opens the Conversation at the reply.

## 5. Featuring from a reply

- [x] 5.1 Add a "Feature on Overview" icon button to the chart and table card headers, `aria-pressed` when the component is the featured one, calling `feature_component`, with the featured ID read from the Overview of the open Project. Verify: `npm test` passes, and in the app featuring a chart shows it on the Overview and featuring a table replaces it.

## 6. Docs

- [x] 6.1 Describe the Overview in `docs/using.md` (opening a Project, the summary and what it sends to the provider, featuring) and the `overview` table and summary request in `docs/architecture.md`. Verify: the user reviews the text.

## Workflow follow-up

- The user verifies the change in the app.
- Archive with `/opsx:archive`, syncing the delta specs into `openspec/specs/`.
- Mark Roadmap #13 Done and #14 Next in `docs/roadmap.md`.
- Ask before opening the pull request into `dev`.
