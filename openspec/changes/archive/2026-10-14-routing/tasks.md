# Tasks

Builds and tests are run by the user (see CLAUDE.md); a task is done when their run confirms
it.

## 1. Setup

- [x] 1.1 Add `typesafe-sdk` with `uv add` in `sidecar/` and inspect the installed package: the client class and its constructor (key and timeout parameters), whether an async client exists, the `system_one` call and answer objects, and the exception classes; verify `uv.lock` adds only `typesafe-sdk` and record the findings in design D5 if they differ

## 2. Link protocol 3

- [x] 2.1 Add `route.start`, `route.done` and `route.error` and `CallContext.needs_context` to `link.rs` and `link.py`, set the protocol to 3, and add the frames to `src-tauri/fixtures/sidecar-frames.json` (D3); verify `cargo test` passes the fixture round-trip with the new frames
- [x] 2.2 Add `TraitCalls::route` with its timeout, `route.done`/`route.error` handling, dropping routes on disconnect, and `core.request` for routes limited to `secret.get` of `typesafe` (D2); verify with unit tests on a fake link: a `route.done` is returned, no answer times out, a disconnect returns unavailable, `asset.read` gets `unknown_method`, and `openai` gets `secret_not_allowed`

## 3. Sidecar routing

- [x] 3.1 Implement `mini_me_sidecar/routing.py` and dispatch `route.start` in `app.py` (D5); verify by piping `route.start` into the sidecar and answering its `secret.get` with an error, seeing `route.error` with code `secret_unavailable`
- [x] 3.2 With a real Typesafe key, pipe a `route.start` for "thanks, summarize #notes.txt" with the two Mini-Mes; verify `route.done` has `mini_me` (Scribe likely), `reaction` and `needs_context` answers with confidences

## 4. Decision and flow (Rust core)

- [x] 4.1 Add `decide` (D4) replacing the stand-in and keyword rules; verify with unit tests: threshold edge, low confidence and an unknown Mini-Me ID give `Unsure`, no answers give `Unsure` with reason `unavailable`, a mention with no answers answers without a reaction, a reaction below the threshold is dropped, `needs_context` mapping
- [x] 4.2 Add `conversations::system_reply` and the note asking to mention a Mini-Me, with both wordings (D6); verify with a unit test that the note is one complete `message.created` from `system`/`routing` replying to the message
- [x] 4.3 Move routing in `routing::send` to a background thread with the pending set, `needs_context` on the call, the reaction, and the note on `Unsure` or a failed start (D1); verify with unit tests on a fake link that a second send during routing gets `reply_in_progress` and that an unanswered route gets the "unavailable" note and no Trait call

## 5. Key and threshold (Rust core)

- [x] 5.1 Add the `typesafe` keychain account (`is_key_account`), `routing.threshold` in `Settings`, `set_routing_threshold` and the threshold in `get_ai_settings` (D7); verify with unit tests that an old `settings.json` loads with 0.5, that the threshold is clamped, and that `typesafe` is accepted for keys but not as an AI provider

## 6. UI

- [x] 6.1 Add `setRoutingThreshold` and the `KeyAccount` type to the frontend, and show the `system`/`routing` author as "Mini-Me"; verify `npm run build` type-checks
- [x] 6.2 Add the "Choosing a Mini-Me…" status and disable sending while a decision is pending (D8); verify manually in `npm run tauri dev` against the "Waiting for Jev" scenario
- [x] 6.3 Add the Typesafe key row and the threshold field to Settings (D7); verify manually that saving the key and changing the threshold persist across a restart
- [x] 6.4 Update the README: the Typesafe key in "Setting up an AI provider", how routing and the note asking to mention a Mini-Me work in "Asking a Mini-Me", and what is sent to Typesafe; verify the steps match the app

- [x] 6.5 Replace Echo with Assistant and the *Assist* Trait in `builtin.json`, the library and routing tests, and the README; verify `cargo test` passes and that "@Assistant what is late blight?" gets an AI answer in `npm run tauri dev`

## 7. Integration check

- [x] 7.1 Run `cargo test`, `cargo test -- --include-ignored` and `npm test` and confirm all pass
- [x] 7.2 Walk through in `npm run tauri dev` with a Typesafe key: an unmentioned summary request goes to Scribe, a vague message gets the note asking to mention a Mini-Me, "thanks" gets a reaction, removing the key gives the "unavailable" note, and a mention still answers without a key

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its specs into `openspec/specs/`, and rewrite the `routing` main spec's Purpose, which still describes the stand-in.
- Mark change 5 "Done" and change 6 "Next" in the README Roadmap.
