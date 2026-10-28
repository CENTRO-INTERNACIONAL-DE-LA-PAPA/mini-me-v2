# Design

## Context

See proposal.md for the motivation. Today:

- `Routing::route` (`src-tauri/src/routing.rs`) turns Jev's answers into a `Decision`.
  When the answerer is unsure, `ask_for_mention` persists a system reply and nothing runs.
  A reply that fails to start also ends in `ask_for_mention`.
- A Trait call reaches the core only through `CallContext` (`context.py`). The core
  answers its requests in `Runs::answer` (`src-tauri/src/runs.rs`). `conversation.history`
  gives a Conversation's messages as text, with components only as their 20-row `text`.

## Goals / Non-Goals

**Goals:**
- Every message without a mention gets a reply, whatever Jev answers.
- Give Trait calls a read-only way to find the Conversation's files and components and read
  a component's full data, all through the core's existing confinement.

**Non-Goals:**
- Any Trait using the new requests (follow-up change `assistant-tools`).
- Telling the user why Assistant answered (#25).

## Decisions

### 1. Routing falls back to a fixed Mini-Me ID
`library.rs` gets `FALLBACK_MINI_ME`, Assistant's ID from `builtin.json`.
`Library::builtin` refuses to load if no Mini-Me has that ID, as the existing
`workflow_problems` checks refuse bad Workflows. `decide` returns the answering Mini-Me's
ID: the mention, else Jev's confident choice of a known Mini-Me, else `FALLBACK_MINI_ME`.
`ask_for_mention` and `mention_request` are removed. A reply that cannot be started (for
example, no sidecar) gets a system note from `routing` with the start error's message.
The reply carries no note saying why Assistant answered: the author shown is enough, and
a missing or failing Typesafe key is better shown once in the app than on every reply
(#25).
*Alternative:* look Assistant up by name. Rejected: names are user-facing and will be
editable once Mini-Me editors exist.

### 2. Two read-only core requests for results
`conversation.results` and `component.read` are answered in `Runs::answer` for Trait calls
only. Model decisions and routing keep allowing only `secret.get`. Both read
`conversation_messages(place.conversation_id)`, which already folds attachments, text
components and components into each `Message`:
- **`results`**: walks the messages newest first and takes attachments plus `asset` text
  components, de-duplicated by ID with media type from the Asset registry, and replies'
  components with the author's Mini-Me name from the library. Each list stops at 50.
- **`component.read`**: finds the message that holds the component, loads that message with
  its components' data, and returns the component, or answers `not_found`.

The listing and the lookup are pure functions over `&[Message]` in `history.rs`
(`results`, `component_message`), next to `history`, so they get inline Rust tests. Asset
contents are still read with `asset.read`, whose existing confinement check holds. No path
is ever sent.

## Risks / Trade-offs

- [The fallback makes Assistant answer requests a specialist would handle better when Jev is
  unsure] → Specialists still win when Jev is confident, and the user can mention one;
  #25 warns when Jev cannot be asked at all.
- [The new requests ship before any Trait uses them] → They are read-only and tested;
  `assistant-tools` is their first user.

## Migration Plan

- Link protocol 5 → 6. Core and sidecar ship together, and a mismatch shows as
  `incompatible` as before.
- Stored events and the database schema are unchanged. Existing ask-for-mention notes stay
  as system replies and are still left out of history.
- `openspec/config.yaml` (Routing invariant), README (concepts and routing sections) and
  `docs/architecture.md` describe the fallback. The README Roadmap is not changed.
