# Tasks

## 1. Ordered debug records

- [x] 1.1 Add migration 11 → 12 (rebuild `debug_records` with `position` in its key, keeping Jev's records at 0), `ProjectState::append_debug_record` and `debug_records(message_id, kind)` in order, replace the `get_debug_record` IPC with `get_debug_records`, and make `JevDebugBlock` read the list; verify with the migration test, a store test that appended records come back in order next to Jev's, `cargo test` and `npm test`

## 2. The switches and the link

- [x] 2.1 Add the `debug` settings (`reply_input`, `reply_details`, `reply_tools`) with their IPC setter and AI settings view, `RunContext.debug` filled from them and Developer mode, and `SidecarFrame::RunDebug` stored with `append_debug_record` for an open run; add both to the frames fixture; verify with a runs test that a `run.debug` lands as the reply's next record and one for a closed run is dropped, and `cargo test` passes

## 3. Catching calls in the sidecar

- [x] 3.1 Add the `Recorder` (its `ContextVar`, the LangChain callback handler, serialising messages, `continues`), set it in `Run.trait()` and `Run.decide()` while a `debug` flag is on, and attach it in `chat_model()`; verify with pytest tests that a fake chat model's call sends one entry with only the enabled parts, that a second call continuing the first sends only the new messages, and that nothing is sent with every flag off
- [x] 3.2 Record tool calls in `prompt.py`'s `_converse` after each final result, with the asking call's `id`, only while `tools` is on; verify with a pytest test of a round with one tool call

## 4. The block and the Developer page

- [x] 4.1 Add `ReplyDebugBlock` under replies (grouping entries into model calls with their tool calls, rebuilding each input from the calls it continues, "Nothing recorded for this reply", "Copy as JSON"), its types and `api.ts`; verify with a frontend test of the grouping and rebuilding, `npm test`, and in the app with a reply of Assistant that reads a table
- [x] 4.2 Add "Show what the AI read", "Show model call details" and "Show tool calls" to the Developer page and update the debugging notes in `docs/architecture.md`; verify in the app that each switch stores and shows only its part, and that Plotter, a Workflow decision and the Dataverse search are recorded

## Workflow follow-up

- Archive the change with `/opsx:archive`, then open the pull request into `dev`.
