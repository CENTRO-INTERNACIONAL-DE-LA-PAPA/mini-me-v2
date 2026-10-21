# Proposal

## Why

Opening a Conversation with long replies freezes the app until it has loaded (issue #20).
The UI rebuilds the Conversation by replaying every event from sequence 1, and each streamed
`message.delta` is its own event, so a few long replies mean thousands of events. The Rust
core sends them one by one while it holds the Project lock, which also stalls replies
streaming in other Conversations. The UI then re-renders the whole message list for each one.
Subscriptions are never removed either, so every Conversation opened since the app started
keeps receiving events.

## What Changes

- Opening a Conversation reads its messages as stored in `project.sqlite` and subscribes
  only to events after the latest stored sequence number, in one step, so that no event is
  lost or received twice. Failure details, Jev's answers and the progress of a streaming
  reply, which the stored messages lack, are read from the stored events. No schema
  migration is needed.
- The Rust core no longer sends events to the UI while it holds the Project lock. It queues
  them per subscription and sends them in batches, gathering about 16 ms of events per batch.
  Streaming looks the same to the user, with far fewer UI updates.
- Closing a Conversation ends its subscription. When the UI starts (including after a window
  reload), the core drops the subscriptions left by earlier views.
- The UI applies a batch of events with one update, re-renders only the messages that
  changed, and scrolls only when the list grows or the last message changes.
- Subscribing from a sequence number (catch-up) stays available, now delivering batches.

What users see: Conversations open at once, replies keep streaming smoothly (including in
another Conversation while one opens), and switching between Conversations no longer slows
the app over time.

Out of scope:
- Virtualising the message list (only visible messages rendered), and paging older messages.
- Changing how deltas are stored, and any change to the `project.sqlite` schema.
- How long Conversations are sent to Traits (`conversation.history` and
  `conversation.results`).

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `event-protocol`: delivery to the UI gains opening a Conversation from its stored state,
  batched delivery that never holds up persistence, and ending a subscription.
- `conversations`: a Conversation opened from its stored messages matches a full replay of
  its events.

## Impact

- Rust core: `src-tauri/src/store.rs` (subscribers, `subscribe`, delivery in
  `persist_all`, a new snapshot read), `src-tauri/src/ipc.rs` and `src-tauri/src/lib.rs`
  (new `open_conversation`, `unsubscribe_conversation` and subscription reset commands;
  channels carry batches), `src-tauri/src/protocol.rs` (the snapshot's message view).
- UI: `src/api.ts`, `src/protocol/eventStore.ts` (load a snapshot, apply a batch),
  `src/components/ChatView.tsx` (open and unsubscribe, scrolling),
  `src/components/MessageItem.tsx` (memoised), app start-up (subscription reset).
- Specs: `openspec/specs/event-protocol/spec.md`, `openspec/specs/conversations/spec.md`.
- The Tauri channel's payload changes from one event to a list of events. Only this app's UI
  reads it, and both sides change together.
