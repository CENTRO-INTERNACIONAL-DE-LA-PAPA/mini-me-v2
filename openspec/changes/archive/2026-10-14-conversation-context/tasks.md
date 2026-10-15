# Tasks

Builds and tests are run by the user (see CLAUDE.md); a task is done when their run confirms
it.

## 1. History in the Rust core

- [x] 1.1 Add `ProjectState::conversation_messages`, the shared file-name helper (D2), and the pure `history` function with its budget (D1); verify with unit tests: oldest-first order, the budget edge, a message larger than the budget, routing notes left out, an unknown Mini-Me named "Mini-Me", and `complete: false` for a stopped reply
- [x] 1.2 Give `TraitCalls` the shared library, record each call's answered message, serve `conversation.history`, and add `mini_me_name` to `call.start`'s context (D1, D3, D4); verify with a unit test on a fake link that a follow-up call's history holds the earlier exchange, and that `src-tauri/fixtures/sidecar-frames.json` round-trips with `mini_me_name`

## 2. Prompt adapter

- [x] 2.1 Add `needs_context`, `mini_me_name` and `history()` to `CallContext`, and build chat turns in the prompt adapter (D3); verify by piping a `call.start` with `needs_context: true` into the sidecar: it sends `conversation.history` (answered with two entries) and then `secret.get` (answered with an error), and ends with `call.error`; with `needs_context: false` it sends no history request
- [x] 2.2 With a real key, ask Scribe to summarize a file, then send "@Scribe make it shorter" and "@Assistant what would you test next, based on that?"; verify both follow-ups use the earlier replies

## 3. Docs and integration

- [x] 3.1 Mention in the README's "Asking a Mini-Me" that Mini-Mes see the Conversation's earlier messages when a message needs them; verify it matches the behaviour
- [x] 3.2 Run `cargo test`, `cargo test -- --include-ignored` and `npm test` and confirm all pass

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its specs into `openspec/specs/`.
- Mark change 6 "Done" and change 7 "Next" in the README Roadmap.
