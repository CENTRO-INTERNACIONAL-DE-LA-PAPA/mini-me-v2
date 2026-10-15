# Design

## Context

- `TraitCalls::answer` serves `core.request` for open calls (`asset.read`, `secret.get`). It
  knows each call's Project and reply message, but not the Mini-Me library, which lives in
  `Routing`.
- The `messages` table holds every message (author, content, status, `reply_to`,
  attachments, Text Components) in insertion order. Routing notes are `system`/`routing`
  replies.
- The prompt adapter builds one user prompt (`_material`) and streams `[system, human]`
  through LangChain. `CallContext` has `message`, `trait`, `model` and the frame's
  `context`, which carries `needs_context` since the routing change.

## Goals / Non-Goals

**Goals:**
- One place, the Rust core, decides what history a Trait may see and how large it is.
- No history cost for messages Jev marks as self-contained.

**Non-Goals:**
- Token counting. The budget is in characters, which works for every provider without a
  tokenizer.

## Decisions

### D1. `conversation.history` served by `TraitCalls`

`TraitCalls` gains a shared `Arc<Library>` (the same one `Routing` uses), so history entries
carry Mini-Me names. Each open call records the user message it answers. `answer` handles
`conversation.history` by loading the Conversation's messages and passing them to a pure
`history(messages, before, library, budget) -> History`. That function:
1. keeps the messages before the answered message, dropping `system` authors;
2. walks them newest first, adding entries until the next one would push the total
   `content` length past the budget;
3. returns them oldest first, with `truncated` set when any were left out.

`ProjectState::conversation_messages(conversation_id)` returns messages in row order. Unit
tests cover the order, the budget edge, the oversized message, routing notes, unknown
Mini-Mes and `complete`.

- *Alternative:* sending history in every `call.start`. Rejected by the earlier decision
  that adapters ask for it, so Echo and future non-prompt adapters pay nothing.

### D2. File names in entries

`files` combines attachment names and `asset` Text Component labels without the leading
`#`, deduplicated, as `routing::state` already does for Jev. The function is shared from
`conversations`, so the two cannot drift.

### D3. Prompt adapter chat turns

`CallContext` gains `needs_context` and `async history()`, which sends the request. The
adapter fetches history unless `needs_context is False`. It turns entries into LangChain
messages:
- user entries → `("human", content)`;
- the calling Mini-Me's own replies → `("ai", content)`;
- other Mini-Mes' replies → `("human", "Name replied:\n" + content)`. As named assistant
  turns, models copy the "Name:" prefix into their own reply.

The system prompt starts with "You are <name>, a Mini-Me." when the name is known.
- an incomplete reply gets " [stopped before finishing]" appended;
- an entry with files gets "(files: a.txt, b.csv)" appended.

Consecutive turns of the same kind are merged with a blank line, because Anthropic and
Google expect alternating roles. If the history starts with an assistant turn, a short user
turn "(earlier messages were left out)" is put first.

The adapter needs the calling Mini-Me's name to know which replies are its own. The name
comes from the reply's author, so `call.start`'s context gains `mini_me_name`, which is
null for calls that are not Mini-Me replies.

### D4. Protocol

`conversation.history` is a new request method, and `context.mini_me_name` is an optional
field the sidecar reads with a default. A new request method and an optional field don't
break either side, so the link protocol stays at 3.

### Process ownership

- **Rust core:** which messages are visible, the budget, names, and leaving out notes.
- **Sidecar:** deciding to ask, and shaping the turns.

## Risks / Trade-offs

- [50,000 characters may exceed a small model's context] → most current models accept
  far more. A provider error would surface as `provider_unavailable`. A per-model budget
  can come later.
- [Jev wrongly says `no` for a follow-up] → the user can mention the earlier message's
  wording. The threshold does not apply to `needs_context`, which is a simple yes/no.
- [Long histories raise the user's cost] → bounded by the budget, and skipped for
  self-contained messages.
