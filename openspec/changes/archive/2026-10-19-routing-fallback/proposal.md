# Proposal

## Why

When no Mini-Me is mentioned and Jev is unsure or cannot be asked, routing stops with
"Mention one with @" and nothing runs, even when Assistant could answer. A scientist's
request should never stop at routing. This addresses #1 (as rewritten). It also adds the
core requests that the follow-up change `assistant-tools` (#3) builds on.

## What Changes

- **Routing falls back to Assistant.** When no Mini-Me is mentioned and Jev is below the
  confidence threshold, chooses an unknown Mini-Me, or cannot be asked (no Typesafe key,
  unreachable, error, timeout), Assistant answers instead of the app asking for a mention.
  The "Mention one with @" reply is removed. **BREAKING** for the routing spec's
  ask-for-mention requirement.
- A reply that cannot be started at all (for example, the sidecar is not running) gets a
  short note from Mini-Me saying why.
- **New core requests** `conversation.results` and `component.read` let a Trait call list
  the Conversation's Assets and components and read a component's full data. No Trait uses
  them yet; `assistant-tools` does. Link protocol version goes from 5 to 6.
- `openspec/config.yaml`, README and `docs/architecture.md` describe the fallback instead
  of asking the user to choose or mention a Mini-Me.

## Out of scope

- Assistant's tools and the `assist` adapter (follow-up change `assistant-tools`, #3).
- Moving adapters onto shared tools (#24); data Traits using the latest table of the
  Conversation (#4).
- Asking the user to choose between two close specialists, and a Settings choice of the
  fallback Mini-Me (dropped from #1).
- A note under the reply saying why Assistant answered, and a warning that Typesafe has
  no key or is unreachable (#25).
- Changes to Jev, its questions, or the confidence threshold setting.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `routing`: below the threshold or without Jev, Assistant answers instead of the
  ask-for-mention reply; a reply that cannot start is explained.
- `mini-mes`: Assistant also answers whenever routing has no confident choice.
- `conversation-context`: new core requests `conversation.results` and `component.read`.
- `trait-execution`: link protocol version 6, and the new requests in the request rules
  (Trait calls only, not model decisions or routing).

## Impact

- **Rust core:** `src-tauri/src/routing.rs` (fallback instead of `ask_for_mention`),
  `library.rs` (the fallback Mini-Me ID must exist), `history.rs` (listing results),
  `runs.rs` (two new request methods), `link.rs` and `sidecar.rs` (version 6).
- **Sidecar:** `context.py` gets `results()` and `read_component()`; `link.py` version 6.
- **UI:** no change.
- **Cost and services:** none. Messages that used to stop at routing now get an answer from
  the AI model chosen in Settings, as any reply does.
- **Dependencies:** none.
