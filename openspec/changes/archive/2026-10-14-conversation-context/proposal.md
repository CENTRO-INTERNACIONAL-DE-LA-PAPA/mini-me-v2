# Proposal

## Why

Every Trait call sees only the current message, so follow-ups like "make it shorter" or
"what about the second point?" fail: the Mini-Me does not know what "it" is. The Rust core
already stores every message, and routing already tells each call whether the message
needs earlier context. What is missing is a way for a Trait to get that history, and rules
for how much of it is sent and in what shape.

## What Changes

- **History request:** a new `core.request` method, `conversation.history`, returns the
  Conversation's earlier messages. Adapters ask for it only when they need it, as they do
  for Assets.
- **What the history holds:**
  - the whole thread before the current message, filled from the newest message
    backwards up to about 50,000 characters;
  - each message's author: "You", or the Mini-Me's name;
  - files from earlier messages by name only. Only the current message's files are read
    in full.

  Mini-Me's own "mention a Mini-Me" notes are left out. Stopped or failed replies are
  included with the text they had, marked as incomplete.
- **Prompt adapter:** when `context.needs_context` is `true` or unknown, it requests the
  history and sends it to the model as earlier chat turns. Replies from other Mini-Mes are
  prefixed with their name, so Assistant can build on Scribe's summary. When Jev says the
  message is self-contained, no history is requested or sent.

## Capabilities

### New Capabilities

- `conversation-context`: the `conversation.history` request, what it returns, its size
  budget, and how files and other Mini-Mes' replies appear in it.

### Modified Capabilities

- `ai-providers`: the prompt adapter sends earlier messages as chat turns when the message
  needs context.

## Impact

- **Rust core:** a history builder over a Conversation's messages, the new request method in
  `TraitCalls`, and access to Mini-Me names there.
- **Sidecar:** `CallContext.history()`, and the prompt adapter building multi-turn chats.
- **Cost:** follow-ups send earlier messages to the provider, which makes those calls
  larger. This is the user's normal usage, and messages Jev marks as self-contained send no
  history.
- **Privacy:** earlier messages of the Conversation reach the provider chosen in Settings,
  as the current message already does. Nothing new is sent to Typesafe.

## Out of scope

- Summarizing long Conversations, and memory across Conversations or Projects.
- Re-reading files from earlier messages.
- Letting the user choose the history size.
- History for the routing request itself (Jev still sees only the current message).
