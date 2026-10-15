# Design

## Context

- The sidecar's Traits are Python classes found by discovery (`traits.list` → `traits`).
  `call.start` is `{ call_id, trait_id, input, context }`. *Echo* is the only real Trait;
  `--test-traits` adds test ones. Link protocol version 1 is in `link.rs` and `link.py`.
- `send_message` sends every message to the `echo` Trait. The reply's author is
  `{ kind: "system", id: "echo" }`, and `MessageItem` shows "Echo" for it.
- Secrets go through `SecretSource` (`NoSecrets` in the app, `MemorySecrets` in tests).
  `TraitCalls` checks `secret.get` against the Trait's declared `providers`. The sidecar
  wraps values in `Secret` and redacts logged frames.
- Text Components are `{ kind, id: Uuid, label, start, end }` with `kind` `asset` only.
  Offsets are UTF-16. The composer's `#` picker lives in `protocol/references.ts` and
  `Composer.tsx`.
- `settings.json` in the app config directory holds the IDs and recent Projects.
- `Author.id` is a string, so a Mini-Me's UUID fits without a protocol change.

## Goals / Non-Goals

**Goals:**
- Traits as data in the core, so the Trait editor later only adds storage and UI.
- One adapter that serves every prompt-based Trait on the four providers.
- Routing behind one function, so Jev replaces it without touching how replies run.

**Non-Goals:**
- Persisting user-made Traits or Mini-Mes; the built-in definitions are compiled in.
- Conversation history in the prompt: *Summarize* sees only the current message and its
  Assets.
- Model listing or key validation against the provider.

## Decisions

### D1. Built-in library as embedded JSON

`src-tauri/library/builtin.json` holds the Trait and Mini-Me definitions, embedded with
`include_str!` and parsed once at start into a `Library` (module `library`). A unit test
checks it: unique IDs, every Step's Trait exists, and Trait names are Title Case verbs.
Fixed UUIDs make IDs stable across installations, so mentions and reply authors in old
Conversations keep resolving. Colours:
- Scribe: tint `#E3DFFF`, solid `#6E5BFF`, ink `#4A3AE0`;
- Echo: tint `#E4ECF2`, solid `#5B7A90`, ink `#2F4A5C`;
- *Summarize* solid: `oklch(0.5 0.1 260)`;
- *Echo* Trait solid: `oklch(0.55 0.05 230)`.

- *Alternative:* a Rust literal. Rejected: JSON is the shape user-made definitions will be
  stored in, so the loader and the validation carry over.

### D2. Adapters and link protocol 2

- **Sidecar:** `traits/` becomes `adapters/`. `Trait`/`TraitInfo` become
  `Adapter`/`AdapterInfo` with `providers`. `run(ctx, input)` stays. `CallContext` gains
  `trait` (`id`, `name`, `instructions`) and `model` (`provider`, `model` or `None`).
  `--test-traits` becomes `--test-adapters`.
- **Frames:** `adapters.list` / `adapters`, and `call.start` with
  `{ call_id, adapter, trait, model, input, context }`. `PROTOCOL` / `SIDECAR_PROTOCOL`
  become 2. `protocol/fixtures/sidecar-frames.json` is updated, and the round-trip test
  covers the new shapes.
- **Rust core:** `TraitCalls::start` takes the Trait definition and the optional model,
  looks up the adapter's declared `providers` from discovery, and records the call's model
  provider for the `secret.get` check (D6).

### D3. Routing as a pure function

The new `routing` module has two functions:
- `answerer(message, library) -> MiniMeId`: the first `mini_me` Text Component, or the
  stand-in (always Echo);
- `reaction(content) -> Option<&'static str>`: the keyword rules, as whole words or
  phrases, case-insensitive, with 🎉 before 👍.

Both are unit-tested. `send_message` does the following, in order:
1. validate;
2. persist the user message;
3. pick the answerer and create the reply (author `mini_me`);
4. persist the reaction, if any, from that Mini-Me;
5. start the call.

The Jev integration in change 5 replaces the stand-in branch of `answerer` and the body of
`reaction`.

### D4. Input text without mentions

`input.text` is the content with every `mini_me` span removed (by its UTF-16 offsets) and
trimmed. Asset references stay in the text as their labels, so "summarize #notes.txt"
reads naturally to the model. A unit test covers a mention at the start, in the middle,
and next to non-ASCII text.

### D5. Mentions in the UI

`references.ts` generalizes its query detection to a trigger character: `#` for Assets,
`@` for Mini-Mes. `DraftReference` gains `kind`. The composer shows Mini-Me suggestions from
`list_mini_mes` (filtered by name). Message chips for `mini_me` use the Mini-Me's
`tint`/`ink` (allowed by DESIGN.md's Mini-Me colour rule). Frontend tests extend
`references.test.ts`. The core validates `mini_me` IDs against the library in
`conversations::send`.

### D6. API keys in the OS keychain

`KeychainSecrets` implements `SecretSource` with the `keyring` crate (v3, features
`apple-native` and `windows-native`; service `org.cipotato.mini-me`, account = provider ID).
It reads the keychain on each request and never caches.
- *Why `keyring`:* it is the standard Rust wrapper for Windows Credential Manager and the
  macOS Keychain, needs no system prerequisites on those platforms, and ships no services.
  Without a Linux feature it falls back to an in-memory mock; Linux is not shipped.

`TraitCalls` refuses `secret.get` unless the provider is in the adapter's `providers` *and*
equals the call's `model.provider`. Commands, with keys flowing only from the UI to the core:
- `get_ai_settings` → `{ provider, model, saved_keys: [provider] }`;
- `set_ai_model(provider, model)`;
- `save_api_key(provider, key)`;
- `remove_api_key(provider)`.

Error messages are built from the provider name only, never from the key.

### D7. Model setting and `model_not_set`

`Settings` gains `ai: { provider, model }` (`#[serde(default)]`, provider `openai`, model
empty). When the answering Trait's adapter declares providers and the model is empty, the
core creates the reply and ends it at once with `message.failed` code `model_not_set`,
without starting a call. A missing key is found by the adapter's `secret.get`, which yields
`secret_unavailable`. The adapter turns that into the actionable message from the
`credentials` spec.

### D8. The prompt adapter

`adapters/prompt.py`. The model's input ("material") is the `input.text` plus, for each
distinct Asset among the message's attachments and `asset` Text Components:
- the Asset's name and its content, read with `ctx.read_asset` and decoded as strict UTF-8;
- if decoding fails, its name goes on an "unreadable" list instead.

If the material exceeds 400,000 characters, the adapter raises `input_too_large`.
Otherwise it streams from the provider:

| Provider | Chat model |
|---|---|
| `openai` | `langchain_openai.ChatOpenAI` |
| `openrouter` | `ChatOpenAI` with `base_url="https://openrouter.ai/api/v1"` |
| `anthropic` | `langchain_anthropic.ChatAnthropic`, `max_tokens=4096` |
| `google` | `langchain_google_genai.ChatGoogleGenerativeAI` |

The adapter streams with `astream([system, human])` and writes each chunk's text with
`ctx.write`. It checks `ctx.cancelled` between chunks and stops reading when the call is
cancelled. If any Asset was unreadable, it appends a final line naming those Assets ("Could
not read … — only text files are supported for now.").

Error mapping:
- authentication errors (401/403, or Google's 400 for an invalid key) → `provider_auth`;
- 404 → `provider_model`;
- 402, 429 or insufficient credit → `provider_rate_limit`;
- connection errors and other statuses → `provider_unavailable`.

The status is read from the underlying SDK's exception (`status_code` or `code`), falling
back to the status in the error text, since integrations differ in how they wrap errors.
Provider messages are never passed on, because some echo part of the key. The key is passed
to the chat model's constructor through `Secret.reveal()`, and only there.

- *Why LangChain's chat models:* one interface across the four providers, including the
  tool calling and structured output that later Traits need (tables, charts, *Find Papers*).
  Each integration wraps its provider's official SDK. The provider classes are used
  directly instead of `init_chat_model`, which lives in the full `langchain` package and
  pulls in LangGraph. LangGraph arrives in change 10, where it runs multi-Step Workflows.
- *Alternative:* the three official SDKs directly. Rejected: every Trait with tools or
  structured output would need one code path per provider.

### D9. Settings screen

A gear button in the Project picker header and the Project sidebar opens a full-page
Settings view (an app-level view state; there is no router). It contains:
- a provider select;
- a model text field with a per-provider example placeholder;
- one row per provider showing "Saved" or "Not set", with a password field and Save,
  Replace and Remove actions.

The `select` and `label` components are added with the shadcn CLI and restyled to
DESIGN.md.

### Process ownership

- **Rust core:**
  - the library;
  - routing and reactions;
  - Settings persistence;
  - the keychain and the `secret.get` checks;
  - the `model_not_set` refusal.
- **Sidecar:**
  - the adapters;
  - provider calls;
  - building the material from Assets it reads through the core.
  It holds no state between calls.
- **UI:**
  - the Settings view;
  - the `@` picker;
  - Mini-Me display.
  It never receives a saved key.

## Risks / Trade-offs

- [The LangChain packages or their dependencies (`pydantic`, `httpx` and others) may lack
  Python 3.14 wheels for a platform] → `uv add` and `npm run bundle-sidecar` on macOS show it, and the next CI
  release shows it for Windows. The fallback is pinning versions that have the wheels, or the
  official SDKs directly.
- [The bundle grows by roughly 20–40 MB] → accepted. It is shipped once per update.
- [macOS asks for keychain access again after each local rebuild, because the unsigned
  app's signature changes] → only affects the maintainer's local builds; "Always Allow"
  per build.
- [A free-text model ID is easy to mistype] → `provider_model` names the model and points
  to Settings.
- [Keyword reactions misfire ("not great")] → accepted for a stand-in that Jev replaces.
- [Old Conversations have `system`/`echo` replies] → still shown as "Echo";
  `MessageItem` keeps that case.

## Migration Plan

`settings.json` gains `ai` with serde defaults, so existing files load unchanged. No Project
data changes. The protocol bump only affects development, where a stale sidecar is shown as
`incompatible` (fix: `uv sync` / restart).
