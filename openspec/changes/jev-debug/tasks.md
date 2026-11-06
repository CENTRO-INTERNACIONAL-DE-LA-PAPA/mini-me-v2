# Tasks

## 1. The debug table

- [x] 1.1 Add migration 10 → 11 in `db.rs` (the `debug_records` table and its index, and deleting `routing.answered` events), `ProjectState::put_debug_record`, `debug_record` and `clear_debug_records` in `store.rs`, and delete a Conversation's records when it is deleted; verify with a migration test in the style of the existing "a_version_N_database" tests and a unit test that a record is written, read back, replaced, cleared, and deleted with its Conversation, and `cargo test` passes
- [x] 1.2 Retire `routing.answered`: remove `EventKind::RoutingAnswered`, `JevAnswers`, `MessageView.jev` and `record_jev_answers`, drop the type from `message_views()`, `fixtures/replay.json`, `eventStore.ts` and `types.ts`, and make `routing.rs` write a `jev` record with the answers instead (nothing else yet); verify with `cargo test` and `npm test`

## 2. What Jev was asked

- [x] 2.1 Build `asked` (`{ state, questions }` from the Choices sent) in `routing.py` and put it on `route.done` and `route.error` (`null` before the request is sent); verify with a pytest test of `asked` for the `file` and `needs_context` questions
- [ ] 2.2 Carry `asked` through `link.rs` and `Runs::route` on success and on error, add the `routing.show_asked` setting with its IPC getter and setter, and store each part of the `jev` record only while its switch is on; verify with a routing unit test using the frames fixture for both switches on, only the answers, and a timeout, and `cargo test` passes

## 3. The block and the Developer page

- [ ] 3.1 Add `get_debug_record` (IPC and `api.ts`) and rebuild `JevAnswersBlock`: shown under every user message while a Jev switch is on, fetched on first expand, the plain-words layout with lighter discarded options, what Jev was asked, "Copy as JSON", and "Nothing recorded for this message"; verify with a frontend test of the question words and option ordering, `npm test`, and in the app by expanding the block under a routed message
- [ ] 3.2 On the Developer page, add "[DEBUG] Show what Jev was asked", "[DEBUG] Debug data" (clear the open Project's records after confirming, disabled without one; `clear_debug_records` IPC) and "[DEBUG] Sidecar log" (`open_sidecar_log` IPC); update the debugging notes in `docs/architecture.md`; verify in the app that each switch shows only its part, clearing empties the blocks, and the log opens

## Workflow follow-up

- Archive the change with `/opsx:archive`, then open the pull request into `dev`.
- Reply debugging (what the AI read, model call details, tool calls) is the next change.
