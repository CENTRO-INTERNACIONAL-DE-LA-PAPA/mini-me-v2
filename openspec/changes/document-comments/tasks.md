# Tasks

## 1. Threads in the core

- [x] 1.1 Add schema version 8 with the `comment_threads` table (`conversation_id`, `asset_id`, `start`, `end`, `quote`, `resolved`, `created_at`) and a `comments` module that creates a thread (a Conversation plus its row) on a passage of a `.qmd` Asset and lists a document's threads; verify with inline Rust tests for creating a thread, refusing a non-document Asset, and the migration from version 7
- [x] 1.2 Skip comment threads in every Conversation listing (sidebar list, recent Conversations, paused approvals, Overview counts, outputs and summary material, Files' "Used in", running replies) with one shared condition; verify with one inline Rust test per listing that a thread does not appear
- [x] 1.3 Save anchors with the document: `save_document` takes `anchors: [{ thread_id, start, end }]` and stores them in the same Project lock as the text; verify with an inline Rust test that saved anchors are read back with the threads

## 2. Comments and Mini-Me runs

- [x] 2.1 Make `Routing::send` handle threads: for a thread's Conversation, ask no Jev, start the @-mentioned Mini-Me's run through `start_reply` with `needs_context: Some(true)`, and start nothing for a note; verify with inline Rust tests that a note starts no run, a mention starts one without a routing request, and a second comment is refused while a reply runs
- [x] 2.2 Add `document: { asset_id, name, passage }` to the run context on both sides of the link, filled for runs in a thread from the saved document at the anchor, list the document in a thread's `conversation.results`, and raise the protocol version; verify with an inline Rust test for the run context and `cd sidecar && uv run pytest`
- [x] 2.3 Add the document's name and passage to the prompt adapter's material when `document` is set; verify with pytest on the material builder

## 3. Suggestions

- [ ] 3.1 Add `suggest_edit` to the sidecar (tool, model form, `TOOL_NAMES`, `MODEL_TOOL_NAMES`, 64 KiB limit), offered by the prompt adapter only when `document` is set; verify with pytest for the size limit and that the tool is not offered outside a thread
- [ ] 3.2 Complete `suggestion` components in the core on `component.add` (`{ document_id, base, text }`, refused with `not_in_thread` outside a thread); add `suggest_edit` to `library.rs`'s tool names and to *Assist* and *Summarize* in `builtin.json`; verify with inline Rust tests for the completed data, the refusal, and the library's Trait lists
- [ ] 3.3 Add `diffy` and `accept_suggestion`, `reject_suggestion` and `ask_again`: a word-level three-way merge of `base`, the current passage and `text`, saving the document and recording `accepted` on a clean merge, returning `suggestion_conflict` otherwise; verify with inline Rust tests for an unchanged passage, a separate edit (the Huancayo and Junín example), an overlapping edit, a detached thread, and Ask again starting a new reply to the same comment

## 4. Resolving and deleting

- [ ] 4.1 Add `set_thread_resolved` and `delete_thread` (stopping a running reply, removing the thread's rows, messages, events, components, steps, reactions and paused runs, keeping Assets); verify with inline Rust tests that a deleted thread leaves no rows and its saved file stays
- [ ] 4.2 Register the new comment commands in `lib.rs` and add their types and calls to `src/protocol/types.ts` and `src/api.ts`; sending, Stop and approvals reuse `send_message`, `stop_reply` and `answer_approval`; verify `cd src-tauri && cargo test` and `npx tsc --noEmit` pass

## 5. The document view

- [ ] 5.1 Add anchor logic in the UI: map thread ranges through editor changes, check them against their quotes on open, re-anchor a passage found once, and detach the rest; verify with `*.test.ts` for mapping, re-anchoring and detaching
- [ ] 5.2 Move ChatView's `useConversation` into its own file, and give `MessageItem` and `Composer` a compact layout for the panel's width; verify `npx tsc --noEmit` and `npm test` pass and the Conversation view looks unchanged
- [ ] 5.3 Add the Preview / Comments switch over the right pane and the comments panel: threads in passage order, each a card titled with its passage that lists its messages with `MessageItem` and takes comments with `Composer` (its @ list, Send and Stop), plus "Show resolved", "Detached", Resolve, Reopen and Delete with confirmation; verify in the app that comments, notes and an @-mentioned reply appear, and that resolving, reopening and deleting work
- [ ] 5.4 Add commenting from a selection in the source, the passage highlights, and selecting a card from its highlight and the other way round; verify in the app that a new thread highlights its passage and that clicking either side selects the other
- [ ] 5.5 Add the `suggestion` renderer (pending in the Mini-Me's colour with Accept and Reject, conflicting with Ask again and Dismiss, answered with its decision) and the source decorations for pending suggestions; verify with a renderer test for each state, and in the app that accepting, rejecting, a merged accept and Ask again behave as the specs describe
- [ ] 5.6 Offer `suggest_edit` ("Suggest edits") in the Trait editor's tool choices; verify `npx tsc --noEmit` passes

## 6. Docs and checks

- [ ] 6.1 Update README, `docs/using.md` and DESIGN.md's document view notes as built; verify they match the app
- [ ] 6.2 Run `cd src-tauri && cargo test`, `npm test` and `cd sidecar && uv run pytest`; verify all pass

## Workflow follow-up

- The user verifies the change in the app.
- Archive the change with `/opsx:archive`, syncing its specs into `openspec/specs/`.
- Mark this change "Done" in `docs/roadmap.md` and #22 "Next".
- Ask the user, then open the pull request into `dev`.
