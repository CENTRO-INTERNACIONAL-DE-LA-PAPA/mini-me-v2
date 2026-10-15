# Tasks

Builds and tests are run by the user (see CLAUDE.md); a task is done when their run confirms
it.

## 1. Library and Mini-Mes (Rust core)

- [x] 1.1 Add `src-tauri/library/builtin.json` with *Summarize*, *Echo*, Scribe and Echo (D1) and the `library` module that parses and validates it; verify with unit tests that IDs are unique, every Step's Trait exists, and Trait names are Title Case
- [x] 1.2 Add the `list_mini_mes` command returning ID, name, description and colours; verify `cargo test` passes

## 2. Adapters and link protocol 2

- [x] 2.1 Rename the sidecar's Traits to adapters (`adapters/`, `Adapter`, `AdapterInfo`, `adapters.list`/`adapters`, `--test-adapters`), add `trait` and `model` to `CallContext`, return `unknown_adapter`, and set `PROTOCOL = 2` (D2); verify by piping `adapters.list` into `uv run --frozen python -I -m mini_me_sidecar` and seeing `echo` listed
- [x] 2.2 Update the Rust frame types, `SIDECAR_PROTOCOL = 2`, `protocol/fixtures/sidecar-frames.json` and `TraitCalls::start` (Trait definition, optional model, adapter providers) (D2); verify `cargo test` and `cargo test -- --include-ignored` pass

## 3. Routing and mentions (Rust core)

- [x] 3.1 Add `TextComponentKind::MiniMe`, validate `mini_me` IDs against the library, and build `input.text` without mention spans (D4); verify with unit tests for an unknown Mini-Me being rejected and for mention removal at the start, in the middle and next to non-ASCII text
- [x] 3.2 Add the `routing` module (`answerer`, `reaction`) (D3); verify with unit tests: first mention wins, no mention picks Echo, 👍/🎉 rules as whole words, 🎉 wins, "late blight spreads" gets none
- [x] 3.3 Route `send_message` through `routing`: reply authored by the Mini-Me, reaction persisted from it when the reply starts, the call started for its Step's Trait (D3); verify with unit tests on a fake link that "@Echo hi thanks" produces a reply by Echo with input "hi thanks" and a 👍 from Echo

## 4. Keys and model setting (Rust core)

- [x] 4.1 Add the `keyring` crate (`apple-native`, `windows-native`) and `KeychainSecrets` (D6); verify `cargo build` succeeds
- [x] 4.2 Restrict `secret.get` to the call's `model.provider` (D6); verify with a unit test using `MemorySecrets` that a prompt call for `anthropic` asking for `openai` gets `secret_not_allowed`
- [x] 4.3 Add `ai: { provider, model }` to `Settings`, the `get_ai_settings`, `set_ai_model`, `save_api_key` and `remove_api_key` commands, and the `model_not_set` refusal (D7); verify with unit tests that an old `settings.json` loads with defaults, that a saved key never appears in `settings.json`, and that an empty model fails the reply with `model_not_set` without a call

## 5. Prompt adapter (sidecar)

- [x] 5.1 Add `langchain-core`, `langchain-openai`, `langchain-anthropic` and `langchain-google-genai` with `uv add` in `sidecar/` and confirm `uv.lock` resolves for Python 3.14; verify `npm run bundle-sidecar` succeeds and the packages are in `src-tauri/resources/sidecar/packages/`
- [x] 5.2 Implement `adapters/prompt.py`: the material from text and Assets, the 400,000-character limit, the unreadable-Asset note, streaming for the four providers, cancellation, and the error mapping (D8); verify by piping a `call.start` with a dummy model into the sidecar and seeing `call.error` code `secret_unavailable` when the core has no key
- [x] 5.3 With real keys, ask Scribe to summarize a referenced `.txt` Asset once per provider (OpenAI, Anthropic, Google, OpenRouter); verify each streams a summary, a wrong key gives `provider_auth`, a wrong model ID gives `provider_model`, and Stop ends the reply as stopped

## 6. UI

- [x] 6.1 Add the Mini-Me, AI settings and new Text Component types to `types.ts` and the commands to `api.ts`; verify `npm run build` type-checks
- [x] 6.2 Generalize `references.ts` to `#` and `@` triggers with a `kind` per reference, and add the `@` picker to the composer (D5); verify with Vitest tests for `@` query detection, inserting a Mini-Me mention, and `toTextComponents` producing `mini_me` components
- [x] 6.3 Show replies with the Mini-Me's name and solid-colour mark and mention chips in its tint and ink, keeping "Echo" for old `system`/`echo` replies; verify manually in `npm run tauri dev` against the "Reply header" and "Unknown Mini-Me" scenarios
- [x] 6.4 Remove the reaction controls from `MessageItem` and show reactions as an overlay on the message's corner, taking no layout space (the core's reaction commands stay); verify manually that a Mini-Me 👍 appears on the corner without moving any message and that no reaction control is shown
- [x] 6.5 Add the shadcn `select` and `label` components (`npx shadcn@latest add select label`), then the Settings view with the provider select, the model field and the per-provider key rows, opened from the Project picker and the sidebar (D9), styled to DESIGN.md; verify manually that saving, replacing and removing a key updates "Saved"/"Not set" and that the key never appears in `settings.json`
- [x] 6.6 Document in the README how to add an API key and choose a model, and the predefined Mini-Mes; verify the steps match the Settings screen

## 7. Integration check

- [x] 7.1 Run `cargo test`, `cargo test -- --include-ignored` and `npm test` and confirm all pass
- [x] 7.2 Walk through in `npm run tauri dev`: a message without a mention gets Echo's reply; "@Scribe thanks, summarize #notes.txt" gets 👍 from Scribe and a summary; with no model set the reply fails with `model_not_set`; with no key it fails with `secret_unavailable` pointing to Settings

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its specs into `openspec/specs/`.
- Mark change 4 "Done" and change 5 "Next" in the README Roadmap.
