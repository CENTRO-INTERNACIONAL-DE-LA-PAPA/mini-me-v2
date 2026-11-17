# Design

## Context

See proposal.md for the motivation; the requirements are in the delta specs. The full picture
of the four changes is in `docs/plan-components-tools-routing.md`.

- **Threads** are Conversations with a `comment_threads` row: `asset_id`, `passage_start`,
  `passage_end` (UTF-16), `quote`, `resolved` and `opened_from`.
  - Anchors move in the UI through the CodeMirror field `threadPlacements` (`anchors.ts`). They
    are placed again on open by `placeThreads`, and saved through `save_document` →
    `comments::move_anchors`.
- **Suggestions today** are `suggestion` components in a thread's messages.
  - `comments::suggestion` completes their preview.
  - `comments::accept_suggestion` merges word by word with `diffy` and saves through
    `documents::save`, shifting the anchors.
  - `pending()` picks each thread's newest unanswered one, which `highlights.ts` draws with
    `SuggestedText`.
- **Routing in a thread** (`routing.rs:105-141`) skips Jev and runs only an @-mentioned Mini-Me;
  `hand_off_allowed` refuses in a thread.
- **The document view** refreshes threads when the open thread's messages change (`onActivity`)
  and after an accept.

## Goals / Non-Goals

**Goals:**
- One suggestion object, made one way, answered one way.
- Reuse the anchor, merge and inline-mark code as is, keyed by suggestion instead of by thread.

**Non-Goals:**
- Live updates of suggestions made in another window or Conversation while a document is open:
  they show when the document opens or a reply in one of its threads ends.

## Decisions

These were settled with the user while planning the change.

### A `suggestions` table (Rust core)
Migration 14 adds `suggestions (id, asset_id, passage_start, passage_end, quote, base, text,
author_kind, author_id, state, created_at)`, where `state` is `waiting`, `accepted`, `discarded`
or `replaced`; a document's suggestions are deleted with it (`ON DELETE CASCADE`). It also drops `comment_threads.opened_from`. A new `suggestions.rs` owns the
table and its functions:
- `add`: checks, then the overlap rule;
- `list(asset)`: waiting suggestions only;
- `accept`: the current merge and save, moved from `comments.rs`;
- `discard`;
- `move_anchors`: called from `documents::save` with the thread anchors.

### `document.suggest` replaces `document.edit` (sidecar, Rust core)
- **Sidecar:** `tools/documents.py` gets `suggest(ctx, document_id, find, text)`; `suggest_edit`,
  `edit_document`, `THREAD_TOOLS` and `CONVERSATION_TOOLS` go, and `_offered` returns every
  model tool.
- **Core:** `runs.rs` answers `document.suggest` (the Quarto gate is kept) with
  `suggestions::add`. Outside a thread it adds a `document` core component, unless the reply's
  components already hold one for that Asset.
- **Removed from the core:** `comments::edit_document`, `open_suggestion`, `passages()`,
  `suggestion()` and the `suggestion` branch of `add_component`.
- **Kept:** `passages()`'s exactly-once check moves into `suggestions::add` for one `find`.

### Anchors are shared code (UI, Rust core)
- **UI:** `anchors.ts` generalizes its placement field to any anchored item `{ id, start, end,
  quote }`. Threads and suggestions each get their own field instance and `place*` call.
- **Saving:** `save_document` sends `{ threads, suggestions }` anchors, each `{ id, start, end }`
  (`documents::Anchor`). A suggestion's `quote` is its passage as last saved, as a thread's is.
  The core moves both in the same transaction as the file write.
- **Accept:** `accept` shifts thread and suggestion anchors as `accept_suggestion` shifts
  threads today.

### Inline answer (UI)
- `highlights.ts` draws each waiting suggestion as today.
- Clicking the struck passage or the suggested text opens a small popover anchored there, with
  Accept and Discard, or the conflict message with Discard, or Discard alone when detached.
- `suggestion.tsx`, `document-edits.tsx`, `EditsBar`, `ThreadSuggestionsContext`, the `edits`
  view parameter and `PendingSuggestion` / `pending()` are removed.

### Comments route like messages (Rust core)
- **Routing:** `routing.rs`'s thread path sends one `route.start` like a Conversation, without
  the `file` question, and uses the same decision rules. Assistant answers below the threshold
  or without Jev.
- **Hand-off:** `hand_off_allowed` drops the thread refusal, and the handed-off reply starts in
  the thread's own Conversation.

## Risks / Trade-offs

- **[Every comment now costs a model reply]** → the proposal states this. It is the behaviour the
  user asked for.
- **[Suggestions from the chat don't show live in an open document]** → they show when the
  document is opened. A reply in a thread refreshes them when it ends.
- **[Breaking link change]** → `document.edit` becomes `document.suggest`, and the protocol goes
  to 18.

## Migration Plan

- Migration 14 creates `suggestions` and drops `opened_from`.
- The `suggestion` and `document-edits` kinds are removed with their renderers and from the
  core's refused kinds.

## Settled while planning

- A comment is routed without Jev's `file` question; Jev is still asked who answers and about a
  reaction.
- Suggestions are read when the document opens, when a reply in its open thread ends, and after
  each answer; there is no polling.
- Clicking a suggestion opens a small popover beside it with Accept and Discard, the conflict
  message, or Discard alone when detached.

## Open questions

- **Where a detached suggestion is discarded.** A suggestion whose passage is lost has no place
  in the source to click. Options: (a) a row above the source for each one, opening the popover
  with Discard only (built this way); (b) discard detached suggestions automatically when the
  document opens; (c) list them in the Comments sheet. Recommendation: (a), the smallest change
  that keeps the spec's "offers only Discard".
- **Clicking a struck passage that also has a comment thread.** The suggestion's popover opens;
  the thread still opens from its number badge. Recommendation: keep.
- **The `document` card's title** is the file name without `.qmd`, while Scribe's own card uses
  the YAML title. Recommendation: keep; the file name is what Files shows.
