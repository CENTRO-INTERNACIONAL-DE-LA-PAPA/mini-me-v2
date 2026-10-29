# Proposal

## Why

A Mini-Me can suggest edits to a document only from a comment thread, one passage at a time.
Asking "@Scribe tighten the methods section of #Trial report" in a Conversation should give the
same reviewable suggestions, so the user can have a whole document reworked without
commenting on each passage first, while still accepting every change.

## What Changes

- **Editing a document:** a new edit-a-document tool lets a Mini-Me answering in a
  Conversation suggest edits to a document the message `#`-references or attaches. Each edit
  quotes the exact text it replaces, which must occur once in the saved document, gives the new
  text and a short reason. The tool changes nothing in the document.
- **Edits become comment threads:** each edit opens a comment thread on its quoted passage,
  opened by the Mini-Me: its first message is the reason with the edit as a `suggestion`. The
  thread says "Opened by Scribe · from Trial design", and the Conversation's name opens it.
  Everything else works as in comment threads today: the struck-through passage in the source,
  "Accept and resolve" with the three-way merge, Discard, Resolve and Delete.
- **A card in the reply:** the reply shows one card per edited document with its title, how
  many suggested edits still wait, and Open, which opens the document with its Comments sheet
  showing.
- **No more Try again:** "Try again" goes from every suggestion, including those in threads
  started by the user. To get another version, the user @-mentions the Mini-Me in the thread.
  A conflicting suggestion now says to ask again in the thread or discard it.
- **Traits:** *Assist* and *Summarize* list the edit-a-document tool, and user-made Traits can
  tick "Edit documents"; the tool is offered to a model only outside comment threads.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `document-comments`: threads a Mini-Me opens from a Conversation, who opened a thread and from
  where, and the removal of "Try again".
- `tools`: adds the edit-a-document tool.
- `tool-use`: prompt-based Traits may list edit-a-document, offered only outside comment
  threads.
- `mini-mes`: *Assist* and *Summarize* list `edit_document`.
- `library-editors`: user-made Traits can tick `edit_document`.
- `interactive-components`: adds the `document-edits` component kind, which the Rust core adds,
  and drops "Try again" from the `suggestion` component.

## Out of scope

- Editing a document the message does not `#`-reference or attach.
- Applying edits without the user accepting them, or a way to accept all of them at once.
- Creating or deleting whole documents through this tool; write-a-document still creates them.
- Edits shown in the preview; they appear only in the source.
- Rerunning a Mini-Me from a suggestion's buttons; asking again happens in the thread.

No new external service, credential or cost. Mini-Mes editing documents use the AI model and
keys already chosen in Settings.

## Impact

- Rust core: a `document.edit` request that checks the document and the quotes, opens one
  thread per edit with the Mini-Me's message and its suggestion, and adds the `document-edits`
  card to the reply; `comment_threads` gains the Conversation a thread was opened from (schema
  v9); listed threads say who opened them and from where; `ask_again` is removed.
- Link protocol: the new `document.edit` request method (protocol version 11).
- Sidecar: the `edit_document` tool and its model form, offered only outside threads.
- Library: *Assist* and *Summarize* list `edit_document`.
- UI: the `document-edits` renderer, opening a document with its Comments sheet showing,
  "Opened by … · from …" in the thread view, "Edit documents" in the Trait editor, and Try again
  removed from the `suggestion` renderer.
- Docs: `docs/using.md` and DESIGN.md.
