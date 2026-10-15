# Proposal

## Why

Mini-Me can only echo messages back. Before Traits like *Find Papers* or *Theorize* can
exist, the app needs the pieces every AI Trait relies on:
- the user's own AI provider key, kept safely;
- a model choice;
- a Trait library whose Traits are data, not code;
- Mini-Mes that use those Traits;
- a way to address a Mini-Me with `@`.

One real Trait, *Summarize*, proves them end to end.

## What Changes

- **AI providers:** OpenAI, Anthropic, Google and OpenRouter. API keys are stored in the
  OS keychain (Windows Credential Manager, macOS Keychain) and never in files, logs or
  events.
- **Settings screen:** choose the provider and a default model used by AI Traits, and
  add, replace or remove the API key for each provider.
- **Trait library in the Rust core:** each Trait is a definition held as data (ID, name,
  description, colour, the sidecar adapter that runs it, and its instructions). Two
  built-in Traits:
  - *Summarize*, run by a generic prompt adapter;
  - *Echo*, run by the existing echo adapter.
  The library is read-only in this change.
- **Predefined Mini-Mes**, each with a one-Step Workflow:
  - **Scribe** (placeholder name), which runs *Summarize*;
  - **Echo**, which runs *Echo*.
  Both are read-only.
- **Sidecar adapters:** the sidecar runs *adapters*, and the core sends the Trait
  definition and the model with every call. A new **prompt** adapter calls the chosen
  provider through LangChain's chat models and streams the answer. *Summarize* summarizes the
  message and the text Assets it references or attaches.
  - **BREAKING (link protocol):** `call.start` changes shape and discovery lists adapters,
    so the link protocol version becomes 2. The core and the sidecar ship together, so
    users are not affected.
- **`@`-mentions:** typing `@` in the composer picks a Mini-Me, which becomes a Text
  Component of kind `mini_me`. The mentioned Mini-Me answers. Replies are authored by
  that Mini-Me and shown with its name and colour.
- **Stand-in for Jev:** until routing arrives in change 5, a message without a mention is
  answered by the Echo Mini-Me. The same stand-in decides, with fixed keyword rules,
  whether the answering Mini-Me also reacts to the user's message. A reaction never
  replaces the reply.
- **Reactions in the UI:** the user can no longer add or remove reactions; only Mini-Mes
  react. Reactions are shown on a corner of the message instead of in a row below it. The
  core's reaction commands and events are unchanged.

## Capabilities

### New Capabilities

- `mini-mes`: the Trait library, the predefined Mini-Mes and their one-Step Workflows, and
  how the UI lists and shows them.
- `routing`: which Mini-Me answers a message (mention, or the Jev stand-in) and whether it
  reacts to the message.
- `ai-providers`: the supported providers, the provider and default model setting, and
  the prompt adapter's use of them.

### Modified Capabilities

- `trait-execution`: discovery lists adapters; `call.start` carries the Trait definition
  and model. Adds the *Summarize* Trait and protocol version 2.
- `credentials`: secrets come from the OS keychain and can be managed in Settings.
  `secret.get` is limited to the provider chosen for the call. Missing keys give an
  actionable error.
- `conversations`: replies are authored by the answering Mini-Me, and Text Components gain
  the `mini_me` kind.
- `sidecar-runtime`: the handshake's discovery step lists adapters, not Traits.

## Impact

- **Rust core:**
  - new modules: Trait library and Mini-Mes, routing stand-in, keychain secret source;
  - new settings fields;
  - new commands: Settings, the Mini-Me list, key management;
  - `send_message` routes through the stand-in;
  - link protocol 2.
- **Sidecar:** adapters in place of Traits, the prompt adapter, and pinned
  dependencies `openai`, `anthropic` and `google-genai`. The bundle grows.
- **UI:** a Settings screen, an `@` picker, Mini-Me names and colours on replies, and the
  Mini-Me chip in messages.
- **Dependencies:** the `keyring` crate in Rust; `langchain-core`, `langchain-openai`,
  `langchain-anthropic` and `langchain-google-genai` in Python (each pulls in its provider's
  official SDK). LangGraph is not added yet: it arrives with multi-Step Workflows (change 10).
- **External services and cost:** the prompt adapter calls the chosen provider's API
  with the user's own key. That is the user's normal LLM usage, billed to their own
  account; no other paid service is added. Requests go directly from the sidecar to the
  provider (or to OpenRouter).
- **Credentials:** one API key per provider, in the OS keychain.

## Out of scope

- Creating or editing Traits and Mini-Mes, and the visual Workflow editor.
- Multi-Step Workflows, approvals, conditions and loops.
- The real Typesafe Jev routing and its confidence threshold (change 5).
- Per-Trait model choice; tools for Traits; images and PDFs as Summarize input.
- Listing a provider's available models; checking a key before it is used.
- Linux keychain support (Linux is not shipped).
