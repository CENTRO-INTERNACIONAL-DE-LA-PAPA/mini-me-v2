# Tasks

## 1. Queued delivery in the Rust core

- [x] 1.1 Replace `EventSink` subscribers with subscriptions `{ id, Sender<Event> }` in `store.rs`; `persist_all` only pushes to senders and removes a subscription whose push fails. Verify with a Rust unit test that persisted events reach a subscription's receiver in order, and that a dropped receiver's subscription is removed on the next persist.
- [x] 1.2 Add the delivery thread: block for the first event, gather the rest for 16 ms, send them as one `Vec<Event>` through a sink, and end when the sender drops or a send fails. Verify with a Rust unit test using a recording sink that events persisted together arrive as one batch, and that the thread ends once the subscription is removed.
- [x] 1.3 Move `subscribe(after_seq)` onto the queue: under the mutex, push the stored events after `after_seq` and register the subscription; return its ID. Verify that the existing catch-up tests still pass and that no sink is called while the mutex is held (a test sink that tries to take the Project lock does not deadlock).
- [x] 1.4 Add `unsubscribe(subscription_id)` and a reset that removes every subscription of a Project. Verify with a Rust unit test that no event reaches a subscription after it was removed.

## 2. Opening from stored state in the Rust core

- [x] 2.1 Add `MessageView` (message with `reactions`, `progress`, `jev`, `failure`) and `OpenedConversation` to `protocol.rs`, serialised in the shape the UI's `MessageView` and `ConversationState` use. Verify with a serialisation unit test.
- [x] 2.2 Implement `Project::open`: under the mutex, read messages with component data, reactions, the last `message.failed` per failed message, the last `routing.answered` per message and the progress of streaming messages (last `message.progress` not followed by `message.paused`), read `last_seq` and register the subscription. Verify with Rust unit tests for each of the four extra fields, and that an event persisted after `open` is queued and one persisted before it is not.
- [x] 2.3 Add `src-tauri/fixtures/replay.json`, a hand-written Conversation's events (deltas, a looped Step, a paused and resumed approval, an answered component, reactions added and removed, a failed reply, a stored Jev answer, a streaming reply with progress) and the opened state they give, and a Rust test that persists the events through the store, opens the Conversation and compares. Verify `cd src-tauri && cargo test` passes.

## 3. Commands

- [x] 3.1 Add `open_conversation`, `unsubscribe_conversation` and `reset_subscriptions` to `ipc.rs` and register them in `lib.rs`; change `subscribe_conversation` to a `Channel<Vec<Event>>` that returns the subscription ID. Verify `cd src-tauri && cargo test` passes and the commands appear in the invoke handler.
- [x] 3.2 Update the comment in `apply_projection` that says progress has no projection, so it says where opening reads it from. Verify by reading the comment against `Project::open`.

## 4. The UI

- [x] 4.1 Add `openConversation`, `unsubscribeConversation` and `resetSubscriptions` to `src/api.ts`, and make `subscribeConversation` deliver `ProtocolEvent[]`. Verify `npm test` and the type check pass.
- [x] 4.2 Add `ConversationStore.load(snapshot)` and `applyBatch(events)`, each notifying at most once. Verify with `eventStore.test.ts` tests that a batch notifies once and that events the snapshot already holds are skipped.
- [x] 4.3 Add the fixture test to `eventStore.test.ts`: folding `replay.json`'s events with `applyEvent` deeply equals its opened state. Verify `npm test` passes.
- [x] 4.4 Change `useConversation` to open the Conversation, buffer batches until the snapshot arrives, and unsubscribe in its cleanup after the open request finishes. Verify in the app (`npm run tauri:dev`) that switching Conversations several times and back shows each one correctly.
- [x] 4.5 Call `resetSubscriptions` once when the app starts, before any Conversation opens. Verify in the app that a window reload followed by opening a Conversation shows new events once.
- [x] 4.6 Wrap `MessageItem` in `React.memo`, and scroll `ChatView` to the end only when the number of messages or the last message changes. Verify in the app that a streaming reply still scrolls into view and that scrolling up while another message updates is not pulled down.

## 5. Specs and integration

- [x] 5.1 In the app, open a Conversation with about 10 long replies and confirm it opens without the window freezing, while a reply streams without pausing in another Conversation of the same Project.
- [x] 5.2 Run `openspec validate conversation-open-from-store --strict` and confirm it passes.

## Workflow follow-up

- The user tries the change in the app before the pull request is opened.
- Archive the change (`/opsx:archive`), then open the pull request into `dev` closing #20.
