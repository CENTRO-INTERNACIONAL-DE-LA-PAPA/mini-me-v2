# Tasks

## 1. Routing falls back to Assistant

- [x] 1.1 Add `FALLBACK_MINI_ME` (Assistant's ID) to `library.rs` and refuse to load a
  library without it, with a Rust unit test; verify with `cd src-tauri && cargo test`
- [x] 1.2 In `routing.rs`, have `decide` return the mention, else Jev's confident choice,
  else `FALLBACK_MINI_ME`; remove `ask_for_mention` and `mention_request`, and explain a
  reply that cannot start with a `routing` system note; update the routing tests
  (unsure, unknown choice and no-Jev cases answer with Assistant, the fallback reacts under
  the threshold rule, a reply that cannot start gets the note); verify with `cargo test`

## 2. Results requests in the core

- [x] 2.1 Add pure functions `results(&[Message], current, library)` and
  `component_message(&[Message], id)` to `history.rs` (newest first, at most 50 of each,
  de-duplicated Assets with `current`, component author names), with inline Rust tests;
  verify with `cargo test`
- [x] 2.2 Answer `conversation.results` and `component.read` in `Runs::answer` for Trait
  calls only, and refuse them for model decisions and routing requests with
  `unknown_method`; verify with Rust tests for a Trait call, a decision and a component
  from another Conversation (`not_found`)
- [x] 2.3 Raise the link protocol version to 6 in `src-tauri/src/link.rs` and
  `sidecar/src/mini_me_sidecar/link.py`; verify with `cargo test` and
  `cd sidecar && uv run pytest`
- [x] 2.4 Add `results()` and `read_component(component_id)` to `CallContext` in
  `sidecar/src/mini_me_sidecar/context.py`; verify that the sidecar reaches ready in
  `npm run tauri:dev`

## 3. Documentation

- [x] 3.1 Update the Routing invariant in `openspec/config.yaml`, the routing text in
  `README.md` (concepts, routing section) and `docs/architecture.md` to say Assistant
  answers when Jev is unsure or unavailable; verify that no text still says the user is
  asked to mention or choose a Mini-Me (`grep -n -i "mention one\|asks you to choose"`)

## 4. In the app

- [x] 4.1 Without a mention, with the threshold at 0.99 and with no Typesafe key, Assistant
  answers; mentions and confident choices (Researcher, Skeptic, Plotter) are unchanged; data
  Traits, history, an Investigator approval and stopping a reply work as before; verified by
  the user's run of `npm run tauri:dev`

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its delta specs into `openspec/specs/`.
- Do not touch the README Roadmap.
- Ask before opening the pull request from `feat/routing-fallback` into `dev`; it closes #1.
- Then continue with the change `assistant-tools` (#3) on its own branch.
