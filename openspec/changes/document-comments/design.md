# Design

## Context

See proposal.md for why. What exists today:

- A document is a `.qmd` Asset. The document view (`DocumentView.tsx`) edits its source in
  CodeMirror 6 and saves it through `save_document`, which writes the file through a temporary
  file under the Project lock.
- Replies run only in Conversations. Everything a reply needs comes with that: messages, events,
  streaming, Stop, approvals, Interactive Components, `conversation.history` and
  `conversation.results` for Traits, and `open_conversation` for the UI. Routing (`routing.rs`)
  starts a run from a user message, and an @-mention picks the Mini-Me.
- Interactive Components are added through `component.add` and answered with
  `component.answered`, which the approval component already uses.

## Goals / Non-Goals

**Goals:**
- Reuse what Conversations already have, in the core and the UI, wherever a thread behaves
  like a Conversation: sending, the reply pipeline, Stop, approvals, events, and the message and
  composer components. New code covers only what threads add: anchors, the panel, and
  suggestions.
- Keep durable state in the Rust core: threads, anchors, comments and suggestions live in
  `project.sqlite`; the UI holds anchors only while a document is open.
- Keep the `.qmd` file plain Quarto.

**Non-Goals:**
- Live collaboration on a document, or more than one open document view at a time.
- Re-anchoring with fuzzy matching; a passage is found again only by its exact text.

## Decisions

### A comment thread is a hidden Conversation
Each thread is stored as a Conversation, with a row in a new `comment_threads` table naming
it: `conversation_id`, `asset_id` (the document), `start` and `end` (UTF-16 offsets in the
source, as CodeMirror and `TextComponent` count), `quote` (the passage's text when anchored),
`resolved` and `created_at`. Comments are user messages, and a Mini-Me's answer is a reply,
so streaming, Stop, approvals, components, history and events all work unchanged in a thread.

The queries that list Conversations skip those in `comment_threads`: the sidebar's list,
Home's recent Conversations and paused approvals, the Overview's counts, outputs and summary
material, Files' "Used in", and the running replies behind the Jobs panel. A small SQL
condition (`conversation_id NOT IN (SELECT conversation_id FROM comment_threads)`) is shared by
those queries.

*Alternative:* a separate thread and reply model with its own streaming. Rejected: it would
duplicate the reply pipeline, its events and its tests. *Alternative:* one Conversation per
document holding every thread. Rejected: a Mini-Me's history would mix threads, and one
running reply would block every thread.

### Sending a comment is sending a message
A comment is sent with the existing `send_message` command on the thread's Conversation, so
the UI's send path, validation and `reply_in_progress` check are reused. `Routing::send` checks
whether the Conversation is a thread: if so, it does not ask Jev; a comment that @-mentions a
Mini-Me starts that Mini-Me's run through routing's existing `start_reply`, with
`needs_context: Some(true)` so the thread's earlier messages are its history, and a comment
without a mention starts nothing. Reactions do not belong in threads, so none is added. Stop
and approvals use the existing `stop_reply` and `answer_approval` commands unchanged.

*Alternative:* a separate `send_comment` command. Rejected: it would duplicate `send_message`
and the UI's send path for one difference, skipping Jev.

### What the run gets about the document
`RunContext` gains `document: Option<{ asset_id, name, passage }>`, set for runs in a thread,
with the passage read from the saved document at the thread's anchor when the run starts. The
link protocol version increases. The sidecar's prompt adapter adds the document's name and the
passage to its material, and offers `suggest_edit` only when `document` is set. The core's
`conversation.results` lists the document as an Asset of the thread, so read-a-file can read it;
read-a-file goes through `asset.read`, which only reads Assets of the run's Project.

Adapters other than `prompt` see `document` in their context but need not use it, so no
Trait-provider code changes outside the prompt adapter.

### Suggestions are Interactive Components
`suggest_edit` (sidecar tool) sends `component.add` with kind `suggestion` and data
`{ text }`. The core (`runs.rs`, on `component.add`) refuses it with `not_in_thread` outside a
thread, and otherwise completes the data to `{ document_id, base, text }`, `base` being the
passage as saved at that moment. An answer is a `component.answered` with
`{ decision: "accepted" | "rejected" | "dismissed" }`, as approvals already use. A conflict is
not stored: the core reports it when Accept fails, and the UI shows Ask again and Dismiss.

*Alternative:* a dedicated suggestions table. Rejected: components already give storage,
events, history text and rendering in a reply.

### Accepting with a three-way merge in the core
`accept_suggestion` (Rust core) reads the document, takes the thread's passage at its current
anchor (`ours`), and merges with `diffy::merge(base, ours, text)`. A clean merge replaces the
passage, saves the document through `documents::save`, moves the anchor's end to the merged
text, and records `accepted`; the command returns the new source and anchors, which the view
loads into the editor. A conflict changes nothing and returns `suggestion_conflict`. The view
saves any pending edits before calling it, as it does before Export PDF.

`diffy` 0.5 (MIT/Apache-2.0) is pure Rust with no system dependencies, so it builds on Windows,
macOS and Linux like the rest of the core. It merges line by line, so the passage is split into
words first (one word per line) and joined back, which makes edits to different words of one
sentence merge cleanly.

*Alternative:* merging in the UI with `diff-match-patch`. Rejected: the core owns the file and
its saves, and keeping the merge next to the write avoids racing an autosave.

### Ask again answers the same comment
`ask_again` (Rust core) records `dismissed` on the suggestion and starts the same Mini-Me's run
as a new reply to the comment that asked, so the run's message and history are those of the
first request, while its `document.passage` is the passage as it is now.

### Anchors live in the editor while it is open
The UI keeps each thread's range in a CodeMirror `StateField` and maps it through every change,
so the ranges follow the user's typing. `save_document` gains `anchors: [{ thread_id, start,
end }]`, saved in the same Project lock as the text. On open, `open_comments` returns the
threads; the UI checks each anchor's text against its `quote`, re-anchors a moved passage when
`quote` occurs once in the source, and otherwise marks the thread detached, saving the result
with the next save. Suggestions appear as CodeMirror decorations: the passage in the Mini-Me's
`tint` and a widget below it with the suggested text and Accept and Reject.

### Thread UI reuses the Conversation's components
The open thread uses ChatView's `useConversation` hook (moved to its own file so both views
import it), so its comments and replies stream through `open_conversation` and
`ConversationStore`. The thread view lists its messages with `MessageItem`, which already shows
authors, Markdown, approvals and Interactive Components, including the new `suggestion`
renderer. Its comment field is the existing `Composer`, given the thread's Conversation, which
brings the @ list, mention pills, Send and Stop; `MessageItem` gains a compact layout and
`Composer` a minimal one-line form.

### The Comments sheet, the thread view and number badges
The Comments button, in the Outline menu's place, shows a `ToolSheet` beside the main sheet, as
the Conversation's tool panels do. Its list draws rows from what `list_threads` returns (count
and pending suggestion), so it holds no subscription per thread; a thread left with no comments
is deleted. Opening a thread swaps the list
for the thread view, the only place that subscribes to a thread's events: it lists the messages
with `MessageItem`, pins the pending suggestion first, and takes comments with the one-line
`Composer`. Where a passage sits ("Hypothesis, bullet 3") is worked out in the UI from the
headings and list items above it in the source. The number badges are CodeMirror widgets right
after each passage, numbered as the Open list orders the threads; a pending suggestion is a
line-through mark on the passage with a widget after it holding the suggested text.

### Resolving and deleting
`set_thread_resolved` updates `comment_threads.resolved`. `delete_thread` removes the thread's
rows, messages, events, components, steps, reactions and paused runs in one transaction; Assets
its replies saved stay, as they are Project files. Deleting a thread whose reply is running
stops the run first.

## Risks / Trade-offs

- [Every Conversation query must skip threads] → One shared condition and a test per list
  (sidebar, recent, approvals, Overview, Files, running replies) that a thread does not appear.
- [An outside edit can strand anchors] → Re-anchoring by exact quote; otherwise the thread is
  detached, never lost.
- [Word-level merges can join text oddly at punctuation] → Conflicts fail safe: nothing is
  applied, and Ask again gets a fresh suggestion.
- [Many threads mean many subscriptions] → Subscriptions open only while the comments panel
  shows, and each is the same lightweight channel a Conversation uses.
- [Schema change] → A new table and an index only (schema version 8); existing Projects
  migrate with no data to fill in.

## Migration Plan

Schema version 8 adds `comment_threads`. Rolling back the app leaves the table unused; an
older app refuses the newer database, as for every schema change.
