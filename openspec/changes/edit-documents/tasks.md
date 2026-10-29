# Tasks

## 1. Remove Try again

- [x] 1.1 Remove `Routing::ask_again`, the `ask_again` command and its registration, `api.askAgain`, Try again in `suggestion.tsx` and their tests, and reword the conflict message to "Ask again in the thread, or discard it."; verify `cd src-tauri && cargo test`, `npx tsc --noEmit` and `npm test` pass

## 2. Threads opened from a Conversation (core)

- [ ] 2.1 Add schema version 9 with `comment_threads.opened_from`, and have `list_threads` return each thread's `opened_by` and `opened_from { conversation_id, title }` (title null once that Conversation is deleted); verify with inline Rust tests for the migration from version 8 and the listed fields for a user's thread and a Mini-Me's
- [ ] 2.2 Add `comments::edit_document`: check the document is referenced or attached in the answered message, the call is not in a thread, each `find` occurs once, no edits overlap and each `replace` is at most 64 KiB; then open one thread per edit (the Mini-Me's completed message with its reason and a `suggestion`) and add the `document-edits` component to the reply; verify with inline Rust tests for a successful edit (threads, messages, suggestions, card, unchanged file), each refusal leaving nothing behind, and UTF-16 offsets after non-ASCII text
- [ ] 2.3 Answer `document.edit` in `Runs::answer`, refuse `document-edits` in `component.add`, and add `edit_document` to `library.rs`'s tool names and to *Assist* and *Summarize* in `builtin.json`; verify with inline Rust tests for the request, the refusal and the library's Trait lists

## 3. The tool (sidecar)

- [ ] 3.1 Add `edit_document` (tool, model form, `TOOL_NAMES`, `MODEL_TOOL_NAMES`, the 64 KiB limit), offered by the prompt adapter only when `document` is none, and raise the protocol version to 11 on both sides; verify with pytest for the size limit and that the tool is offered outside a thread and not inside one

## 4. The UI

- [ ] 4.1 Add the `document-edits` renderer (title, "N of M suggested edits waiting" or "All M suggested edits answered", Open, removed document) and let `useOpenDocument` open a document with its Comments sheet showing; verify with a renderer test for the counts and the removed state
- [ ] 4.2 Show "Opened by you", "Opened by Scribe · from Trial design" (the title opening the Conversation) or "Opened by Scribe" in the thread view, and offer "Edit documents" in the Trait editor and the Workflow's tool labels; verify `npx tsc --noEmit` and in the app that asking "@Scribe tighten #Trial report" adds a card, Open shows the threads, accepting counts down, and the link returns to the Conversation

## 5. Docs and checks

- [ ] 5.1 Update `docs/using.md` and DESIGN.md as built; verify they match the app
- [ ] 5.2 Run `cd src-tauri && cargo test`, `npm test` and `cd sidecar && uv run pytest`; verify all pass

## Workflow follow-up

- The user verifies the change in the app.
- Archive the change with `/opsx:archive`, syncing its specs into `openspec/specs/`.
- Mark this change "Done" in `docs/roadmap.md`.
- Ask the user, then open the pull request into `dev`.
