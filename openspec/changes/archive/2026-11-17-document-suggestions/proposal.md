# Proposal

## Why

A suggested edit only exists inside a comment thread, so a Mini-Me asked in the chat to change a
document opens threads nobody wrote, and comments mix discussion with edits. Two edit tools with
different rules, notes that get no answer and a card for each batch of edits make documents
harder to use than the chat. Making a suggestion its own thing, made by one tool from anywhere,
and making comments work like the chat, keeps one flow for each. This is change 3 of 4 of
`docs/plan-components-tools-routing.md`.

## What Changes

- **Suggestions belong to the document.** A suggestion is a proposed replacement of one passage
  of a document, with its author; it is stored on its own, not inside a thread, and does not
  record where it was made.
- **One suggestion tool.** `suggest(document_id, find, text)` replaces suggest-an-edit and
  edit-a-document. Every Mini-Me's model is offered it, in a Conversation or a comment thread,
  for any document of the Project. **BREAKING** for the tools and the link (`document.edit`
  becomes `document.suggest`; protocol 18).
- **Shown and answered inline.** The source shows each waiting suggestion as today, the passage
  struck through with the new text after it in the author's colour; clicking it offers Accept
  and Discard. Accepting merges with the user's own edits as today, and a conflict leaves it
  waiting. A new suggestion that overlaps a waiting one replaces it.
- **The chat reply shows the document.** A reply in a Conversation that made suggestions shows
  the document's `document` card; a reply in a thread shows none.
- **Comments work like the chat.** Every comment gets a reply: the @-mentioned Mini-Me, else the
  one Jev picks, else Assistant. Private notes are removed. A Mini-Me answering a comment can hand
  off as in a Conversation.
- **Removed:** the `suggestion` and `document-edits` components and their renderers, the
  "Accept all / Discard all" bar, the document view's `edits` option, threads opened from a
  Conversation, and resolving a thread dismissing its suggestion.

## Capabilities

### New Capabilities

- `document-suggestions`: suggestions on a document's passages: how they are stored, shown,
  accepted, discarded and replaced, and how their passages follow edits.

### Modified Capabilities

- `document-comments`: every comment gets a reply; notes, suggestions in threads, threads opened
  from a Conversation and the edits bar are removed; resolving no longer touches suggestions.
- `tools`: the suggest tool, its checks and events replace suggest-an-edit and edit-a-document.
- `tool-use`: the suggest tool is offered on every call.
- `interactive-components`: the `suggestion` and `document-edits` kinds are removed.
- `routing`: a Mini-Me answering a comment may hand off; Jev picks who answers a comment.
- `trait-execution`: link protocol 18.

## Out of scope

- Jev's tool, component and hand-off hints, and the hand-off changes (change 4).
- A list of waiting suggestions, or a count of them anywhere.

## Credentials, services and cost

None. Comments now always start a reply, so a comment costs the same model usage as a chat
message.

## Impact

- Rust core: `db.rs` (migration 14: a `suggestions` table, `comment_threads.opened_from`
  dropped), a new `suggestions.rs`, `comments.rs`, `documents.rs`, `runs.rs`, `routing.rs`,
  `components.rs`, `ipc.rs`, `link.rs`.
- Sidecar: `tools/documents.py`, `tools/model.py`, `tools/__init__.py`, `adapters/prompt.py`,
  `context.py`, `link.py`, tests.
- UI: `DocumentView.tsx`, `CommentsSheet.tsx`, `anchors.ts`, `highlights.ts`, `api.ts`,
  `types.ts`, `suggestion.tsx` and `document-edits.tsx` (removed), `catalogue.ts`, `App.tsx`,
  `shell/view.ts`, `ChatView.tsx`, `openDocument.tsx`.
- No new dependencies.
