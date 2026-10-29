# Design

## Context

See proposal.md for why. What exists after #21 (document-comments):

- A comment thread is a hidden Conversation with a `comment_threads` row (`conversation_id`,
  `asset_id`, `passage_start`, `passage_end`, `quote`, `resolved`, `created_at`), created by
  `comments::create`. Its messages, events and components are a Conversation's.
- A `suggestion` component holds `{ document_id, base, text }`. The core completes it in
  `component.add` (`comments::suggestion`) for a call answering a thread, and accepts it with
  `comments::accept_suggestion`, which merges against `base` with `diffy`.
- A Trait call's requests are answered in `Runs::answer` (`runs.rs`), which knows the call's
  Conversation, the message it answers (`answers`), its reply and the reply's author.
- "Try again" is `Routing::ask_again`, the `ask_again` IPC command, `api.askAgain` and a button
  in the `suggestion` renderer (`suggestion.tsx`).
- The document card (`document.tsx`) opens a document through `useOpenDocument`, which takes an
  Asset ID.

## Goals / Non-Goals

**Goals:**
- A Mini-Me's edits from a Conversation become ordinary comment threads, so accepting, merging,
  discarding, resolving and deleting need no new code.
- All checks happen before anything is written, so a refused request leaves no thread behind.
- Durable state stays in the Rust core: the threads, their origin and the card live in
  `project.sqlite`.

**Non-Goals:**
- Applying edits directly, or accepting all of a card's edits at once.
- Editing documents the message does not reference.
- Rerunning a Mini-Me from a suggestion's buttons.

## Decisions

### One request per document, made by the core
`edit_document(document_id, edits)` sends one `document.edit` request with every edit for that
document, and the core does all the work: it checks, opens the threads, and adds the card. The
tool returns the card's ID and the threads, or the core's error for the model to correct.
Doing it in one request keeps the card to one per call and makes "nothing changed on failure"
simple. The tool's description asks the model to send all edits to a document in one call;
two calls on one document give two cards, which is acceptable.

Alternative considered: the sidecar calls `component.add` for each suggestion and for the card.
Rejected: suggestions belong in new threads, which only the core can create, and the card would
need a way to be updated as edits are added.

### Checks (Rust core, `comments::edit_document`)
1. The document must be one of the answered message's attachments or `asset` text components
   (`#` references), and a `.qmd` (`documents::is_document`). The call must not be answering a
   thread (`comments::thread_of` on the call's Conversation is none), else `in_thread`.
2. Read the saved document (`documents::read`). For each edit, find `find` in it by
   `str::match_indices`: none is `passage_not_found`, more than one is `passage_not_unique`;
   the message names the edit by its position and the start of its quote.
3. Sort the found ranges and fail with `edits_overlap` when one starts before the previous
   ends.
4. `replace` larger than 64 KiB fails with `invalid_input`, matching suggest-an-edit's limit.

Offsets are converted to UTF-16 code units, as `comment_threads` stores them for CodeMirror.

### Opening the threads
For each edit, in one transaction per edit: insert the thread with `opened_from` set to the
call's Conversation, insert a completed message in the thread authored by the call's Mini-Me
with `reason` as its content, and add a `suggestion` component `{ document_id, base: find,
text: replace }` to it. The message and component are written through the same functions and
events as a reply (`message.created` with status complete, `component.added`), so an open
thread view shows them live. No run starts in the thread.

Then `conversations::add_component` adds `document-edits` `{ asset_id, title, threads }` to the
reply, with the text "Suggested N edits to <title>" for history; `title` is the document's file
name without `.qmd`. `component.add` refuses `document-edits` from a
Trait call (`component_not_allowed`), as it does `approval`.

### Who opened a thread (schema v9)
`comment_threads` gains `opened_from TEXT NULL`, the Conversation a thread was opened from.
`CommentThread` gains `opened_from: { conversation_id, title, by } | null`: null for a thread
the user started, else the Conversation, its title (null once it is gone) and `by`, the author
of the thread's first message. The thread view shows "Opened by you", "Opened by Scribe ·
from Trial design" with the title as a link, or "Opened by Scribe". The link calls `App`'s
`onNavigate` with `{ kind: "conversation", id }`, passed down to `DocumentView` beside `onClose`.

### The `document-edits` card (UI)
`document-edits.tsx` reuses `DocumentCard`'s layout from `document.tsx`. It lists the
document's threads with `list_threads` when shown and when its reply's Conversation changes, and
counts the card's `threads` that are still listed with a `pending` suggestion. Open calls
`useOpenDocument` with `{ comments: true }`, which `DocumentView` takes as an initial
`showComments`, opening on the Open list.

### Removing "Try again"
Remove `Routing::ask_again`, the `ask_again` command and its registration, `api.askAgain`, the
button and `canTryAgain` in `suggestion.tsx`, and their tests. The conflict message becomes
"You've changed the same words since this was suggested. Ask again in the thread, or discard
it." `Decision::Dismissed` stays: Resolve still dismisses a pending suggestion.

### Tools offered (sidecar)
`edit_document` joins `MODEL_TOOLS` and `TOOLS` in `library.rs` and the sidecar's tool forms.
`_offered()` in `adapters/prompt.py` offers it only when `ctx.document` is none (outside a
thread), the opposite of `suggest_edit`. The protocol version goes to 11 on both sides for the
new request method.

## Risks / Trade-offs

- A model may quote text that differs in whitespace or Markdown marks from the source → the
  error names the edit and says the quote must match the source exactly, so the model can
  re-read the document with read-a-file and quote again.
- Threads are opened one transaction at a time; a database failure partway leaves the earlier
  threads without a card → acceptable, as each thread still works on its own; the request
  reports the error.
- A document open in the document view while a Mini-Me edits it does not show the new threads
  until reopened → the document view replaces the Conversation in the main sheet, so the two are
  not shown together.
- Removing "Try again" changes #21's behaviour → it has not been released yet.
