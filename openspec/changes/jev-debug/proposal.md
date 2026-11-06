# Proposal

## Why

The "[DEBUG] Jev" block is hard to read: each answer is one monospace line with the question's
internal ID, and the chosen and discarded options look alike. It also shows only Jev's answers,
not what Jev was asked, so a wrong pick cannot be traced to the text Jev read. Its answers are
stored as events in the Conversation's log, which every Conversation reads when it opens. Reply
debugging, the next change, will store much more, so debug records need a place of their own
first.

## What Changes

- **Debug records**: a Project keeps developer debug records in a table of their own, outside
  the Conversation's event log. A record is read only when its debug block is expanded, so
  opening a Conversation never reads them.
- **Jev's answers move to debug records**, stored only while Developer mode and "[DEBUG] Show
  Jev's answers" are on, as now. **BREAKING**: Jev's answers are no longer part of an opened
  message, and the `routing.answered` event is retired; answers stored before this change are
  no longer shown.
- **What Jev was asked**: the sidecar returns the request it sent to Jev (the state, and each
  question's instructions and options) with its answer or error, and the record keeps it while
  a new switch, "[DEBUG] Show what Jev was asked", is on. Each Jev switch can be on alone, so a
  developer sees only what they need.
- **A clearer "[DEBUG] Jev" block**: each question in plain words ("Who answers?"), the chosen
  option with its confidence, and the discarded options with their probabilities on a lighter
  line below; then what Jev was asked; and a "Copy as JSON" button that copies the record.
- **Developer page**: "[DEBUG] Sidecar log" opens the sidecar log file, and "[DEBUG] Debug
  data" clears the open Project's debug records.
- Out of scope: what the AI model read for a reply, model call details and tool calls (the
  next change, with its own switch, in the same table); debug records for other Projects than
  the open one; changing how Jev routes.

No new external service, credential or cost.

## Capabilities

### New Capabilities

- `debug-records`: where developer debug records are kept, how they are read, copied and
  cleared, and the "[DEBUG] Jev" block that shows Jev's record.

### Modified Capabilities

- `dev-channel`: the Developer page holds "[DEBUG] Show what Jev was asked", "[DEBUG] Sidecar
  log" and "[DEBUG] Debug data"; Jev's answers are kept as debug records.
- `routing`: `route.done` and `route.error` carry the request sent to Jev.
- `event-protocol`: an opened message no longer carries Jev's answer.
- `conversations`: opening from stored messages no longer compares Jev's answer.

## Impact

- Settings: `routing.show_asked`, next to `routing.show_answers`.
- Rust core: `db.rs` (a migration adding the debug table and removing `routing.answered`
  events), `store.rs` (writing, reading and clearing records; `message_views`), `protocol.rs`
  (`RoutingAnswered`, `JevAnswers`, `MessageView.jev`), `routing.rs`, `conversations.rs`
  (`record_jev_answers`, deleting a Conversation), `link.rs` and `runs.rs` (the request on
  `route.done` and `route.error`), `ipc.rs` (reading a record, opening the log, clearing),
  `sidecar.rs` (the log's path), `fixtures/replay.json`.
- Sidecar: `routing.py` (returning the request).
- UI: `MessageItem.tsx` (`JevAnswersBlock`), `eventStore.ts`, `types.ts`, `api.ts`,
  `SettingsView.tsx`.
- Existing Projects lose the Jev answers they stored before this change.
