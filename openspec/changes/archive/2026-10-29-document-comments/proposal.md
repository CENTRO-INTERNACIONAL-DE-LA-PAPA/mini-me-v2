# Proposal

## Why

A document can be drafted by Scribe and edited in the app, but there is no way to discuss a
passage, or to ask a Mini-Me to rework part of a document and review its change before it
lands. Comment threads with suggestions let the user point at a passage, ask a Mini-Me about
it, and accept or reject what it proposes, without the Mini-Me ever overwriting the user's
text.

## What Changes

- **Comment threads:** the user selects a passage of a document's Quarto source and comments
  on it. Each thread is anchored to its passage, follows it as the user edits, and is stored
  in the Project's database; the `.qmd` file stays plain Quarto. A thread whose passage can no
  longer be found, for example after the file was edited outside Mini-Me, is listed as
  detached with the text it quoted.
- **The Comments sheet:** the Comments button, which replaces the Outline menu, shows a sheet
  beside the document listing its threads, under Open and Resolved tabs. In the source, a
  thread's passage is followed by a badge with the thread's number, which opens the thread.
- **Asking a Mini-Me:** a comment that @-mentions a Mini-Me runs that Mini-Me's Workflow, as a
  reply in a Conversation does, with the thread and its passage as material. Its text reply
  goes into the thread. A comment without an @-mention is a note and starts no run.
- **Suggestions:** a new suggest-an-edit tool lets a Mini-Me in a thread propose replacement
  text for the thread's passage. A pending suggestion is shown in the source in the Mini-Me's
  colour, with Accept and Reject; accepted text then looks like any other text.
- **Accepting after an edit:** a suggestion keeps the passage it was based on. When the user
  has edited the passage since, accepting combines the Mini-Me's change with the user's
  (a three-way merge). When the two overlap, the suggestion is marked as conflicting and offers
  Ask again, which reruns the Mini-Me on the passage as it is now, and Dismiss. The user's text
  is never overwritten.
- **Resolving and deleting threads:** a resolved thread is hidden, with a filter to show it
  again, and can be reopened; a thread can also be deleted.
- **Traits:** *Assist* and *Summarize* list the suggest-an-edit tool, and user-made Traits can
  tick it; the tool is offered to a model only in a comment thread.

## Capabilities

### New Capabilities
- `document-comments`: comment threads on a document's passages, Mini-Mes answering them,
  suggestions and how they are accepted, rejected, merged and asked again, resolving and
  deleting threads, and the comments panel.

### Modified Capabilities
- `documents`: the document view's right pane switches between the preview and the comments
  panel.
- `tools`: adds the suggest-an-edit tool.
- `tool-use`: prompt-based Traits may list suggest-an-edit, offered only in a comment thread.
- `mini-mes`: *Assist* and *Summarize* list `suggest_edit`.
- `library-editors`: user-made Traits can tick `suggest_edit`.
- `interactive-components`: adds the `suggestion` component kind, whose data the Rust core
  completes with the passage it is based on.

## Out of scope

- Editing documents from a Conversation, through an `edit_document` tool (Roadmap #22).
- Comments or marks in the preview; they appear only in the source.
- Storing comments or suggestions in the `.qmd` file.
- Routing a comment without an @-mention to a Mini-Me; such a comment stays a note.
- Showing who wrote which accepted text; colour marks only pending suggestions.
- Listing a Mini-Me answering a comment in the Jobs panel; it shows in its thread.

No new external service, credential or cost. The Rust core gains `diffy` (MIT/Apache-2.0,
pure Rust) for the three-way merge. Mini-Mes answering comments use the AI model and keys
already chosen in Settings.

## Impact

- Rust core: comment threads (one Conversation each, kept out of Conversation lists, the
  Overview, Home and Files), their anchors and resolved state in a new `comment_threads` table
  of `project.sqlite`, starting a Mini-Me's run from a mentioned comment, completing and
  accepting suggestions with a three-way merge, and Ask again.
- Link protocol: the run context gains the thread's document and passage; no new frames.
- Sidecar: the `suggest_edit` tool and its model form, offered only in a thread, and the
  passage in a prompt Trait's material.
- Library: *Assist* and *Summarize* list `suggest_edit`.
- UI: the comments panel and its Preview / Comments switch, anchors that follow edits in the
  CodeMirror source, suggestion marks with Accept and Reject, and the `suggestion` renderer.
- Docs: README, `docs/using.md` and DESIGN.md's document view notes.
