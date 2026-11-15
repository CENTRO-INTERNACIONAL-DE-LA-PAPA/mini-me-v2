# Tasks

## 1. Core: suggestions

- [ ] 1.1 Add migration 14: the `suggestions` table (`id, asset_id, passage_start, passage_end,
  base, text, author_kind, author_id, state, created_at`), and drop `comment_threads.opened_from`.
  Extend the migration test. Verify: `cd src-tauri && cargo test db` passes.
- [ ] 1.2 Add `suggestions.rs` with `add` (`.qmd` check, `find` exactly once, 64 KiB, the overlap
  rule marking older waiting ones `replaced`), `list` (waiting ones of a document) and `discard`.
  One test per rule group: refusals, overlap, list. Verify: `cd src-tauri && cargo test
  suggestions` passes.
- [ ] 1.3 Move the merge from `comments::accept_suggestion` into `suggestions::accept`: merge,
  conflict, detached, save through `documents::save`, and shift both thread and suggestion
  anchors. Make `documents::save` and `save_document` move suggestion anchors with thread
  anchors. Move the existing accept tests. Verify: `cd src-tauri && cargo test` passes.
- [ ] 1.4 Answer `document.suggest` in `runs.rs` with `suggestions::add`. Outside a thread, add the
  document's `document` card once per reply. Remove `document.edit`, `comments::edit_document`,
  `open_suggestion`, `passages()`, `suggestion()`, `Decision`, `pending()`, `PendingSuggestion`,
  `opened_from` from `CommentThread`, the `suggestion` branch of `add_component`, and
  `suggestion`/`document-edits` from `CORE_KINDS`. Update the affected tests. Verify:
  `cd src-tauri && cargo test` passes.
- [ ] 1.5 Route a comment like a message (Jev without the `file` question, Assistant below the
  threshold), and allow hand-off in a thread. Replace the note test with a routed-comment test,
  and update the hand-off test. Verify: `cd src-tauri && cargo test routing runs` passes.
- [ ] 1.6 IPC: `list_suggestions`, `accept_suggestion(id)` and `discard_suggestion(id)`; remove
  `answer_suggestion`. Set `SIDECAR_PROTOCOL` to 18. Verify: `cd src-tauri && cargo test`
  passes and `cargo clippy` adds no warning.

## 2. Sidecar

- [ ] 2.1 Add `suggest(ctx, document_id, find, text)` with its model form and `ctx.suggest`.
  Remove `suggest_edit`, `edit_document`, `THREAD_TOOLS` and `CONVERSATION_TOOLS`, and make
  `_offered` return every model tool. Set `PROTOCOL` to 18. Update `test_documents.py` and
  `test_prompt_turns.py`. Verify: `cd sidecar && uv run pytest` passes.

## 3. UI

- [ ] 3.1 Add the `Suggestion` type and the `listSuggestions`, `acceptSuggestion` and
  `discardSuggestion` API calls. Remove `PendingSuggestion`, `opened_from`, the `edits` view
  parameter, `EditsBar`, `ThreadSuggestionsContext`, `suggestion.tsx`, `document-edits.tsx` and
  their tests and catalogue entries. Verify: `npx tsc --noEmit` is clean.
- [ ] 3.2 Generalize `anchors.ts` to any anchored item, and place, follow and save suggestions
  with threads. Draw waiting suggestions in `highlights.ts` from the list. Re-read them on open,
  when a reply in the open thread ends, and after each answer. Update `anchors.test.ts`. Verify:
  `npm test` passes.
- [ ] 3.3 Add the popover: clicking a suggestion shows Accept and Discard, the conflict message
  with Discard, or Discard alone when detached. Verify: `npx tsc --noEmit` is clean and
  `npm test` passes.
- [ ] 3.4 Make Resolve in the thread view only resolve, with no dismissal. Verify: `npm test`
  passes.
- [ ] 3.5 In the app:
  - comment "too long" without a mention and check a Mini-Me answers;
  - ask it to shorten the passage and check the suggestion shows in the source;
  - accept it;
  - ask Scribe in a Conversation to shorten a referenced document, check the reply shows the
    document card and the suggestions show when it opens, and discard one.

  Verify: the user's run confirms it.

## 4. Docs

- [ ] 4.1 Update `docs/architecture.md` and `docs/using.md` where they describe notes, thread
  suggestions or edit-a-document, and add the change's line to `CHANGELOG.md`. Verify: `grep -n
  "suggest_edit\|edit_document\|note" docs/` finds nothing outdated.

## Workflow follow-up

- Archive the change (`/opsx:archive`); then reword the `document-comments` spec's Purpose, which
  still mentions notes and suggestions.
- Commit in batches and push to PR #186.
- Propose change 4 (Jev hints and hand-off).
