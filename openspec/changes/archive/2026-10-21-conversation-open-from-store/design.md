# Design

## Context

- **Rust core.** `Project::subscribe` (`src-tauri/src/store.rs`) holds the Project mutex
  while it loads every event after `after_seq`, sends each one to the subscriber's sink and
  registers the sink. `persist_all` commits a batch of events and then, still under the same
  mutex, sends each event to every sink of the Conversation. Every write in
  `conversations.rs` takes that mutex, so a slow send blocks persisting in every
  Conversation of the Project.
- **Subscriptions.** Sinks live in `subscribers: HashMap<Uuid, Vec<Box<dyn EventSink>>>`
  and are dropped only when a send fails. A Tauri `Channel` send keeps succeeding while the
  webview exists, even after the UI stopped listening, so sinks are never dropped in
  practice. React StrictMode mounts `ChatView` twice in development, registering two sinks
  per open.
- **UI.** `useConversation` (`src/components/ChatView.tsx`) subscribes from 0 and calls
  `ConversationStore.apply` for each event. Each event notifies React, `applyEvent` builds a
  new `messages` array, every `MessageItem` re-renders (it isn't memoised), and the list
  scrolls into view. `updateMessage` keeps unchanged message objects identical, so memoising
  `MessageItem` takes effect at once.
- **Stored state.** The `messages` projection and its tables (`message_steps`, components,
  `reactions`) hold each message's content, status, `reply_to`, attachments, Text
  Components, Steps, Interactive Components with data and answer, and reactions. They don't
  hold three things the UI shows: a failed reply's `ErrorInfo` (only `status = 'failed'`),
  Jev's answers (`routing.answered`) and a streaming reply's progress. All three are in the
  `events` table, whose `type` column can be filtered within a Conversation.

## Goals / Non-Goals

**Goals:**
- Open any Conversation in one request whose cost depends on its number of messages, not
  its number of events.
- Never send events to the UI while holding the Project mutex.
- Deliver events to the UI in batches of at most about 16 ms.
- End subscriptions when a Conversation closes and when the UI starts.
- Re-render only the messages that changed.
- Prove that opening from stored state equals a full replay.

**Non-Goals:**
- Virtualising the message list or paging older messages.
- Changing the `project.sqlite` schema or how deltas are stored.
- Speeding up what Traits receive (`conversation.history`, `conversation.results`).

## Decisions

### 1. The Rust core builds the opened state from the projection

The Rust core owns durable state, so it builds the snapshot. `Project::open` runs under the
mutex and does only SQLite reads, then registers the subscription and returns:

```
OpenedConversation {
  subscription_id: Uuid,
  last_seq: i64,
  messages: Vec<MessageView>,
}
MessageView = Message + { reactions, progress, jev?, failure? }
```

- Messages come from the projection with component data (`load_message_with(id, true)`),
  in `rowid` order, as the UI's replay adds them.
- Reactions come from the `reactions` table in `rowid` order, matching the order a replay
  adds them in; removed reactions are already gone from it.
- `failure`: the payload of the last `message.failed` event of each failed message.
- `jev`: the payload of the last `routing.answered` event of each message. These events exist
  only when the developer setting stored Jev's answers.
- `progress`: only for streaming messages, from the last `message.progress` event, when no
  `message.paused` follows it. This mirrors the UI's reducer, where pausing clears progress
  and resuming leaves it empty until the next `message.progress`; the equivalence test
  (decision 6) holds the two together.
- The extra reads use `json_extract(body, '$.payload.message_id')` over events filtered by
  `conversation_id` and `type`, so they read only those few event types.

Reading `last_seq` and registering the subscription under the same mutex hold as the reads
means every event persisted later has a greater `seq` and reaches the subscription, and
none persisted earlier does.

*Alternative considered:* merging consecutive deltas during replay. It still sends far more
than the messages themselves, and the merged events would no longer match the stored ones.

*Alternative considered:* new projection columns for failure, Jev's answers and progress.
That needs a schema migration of every existing Project, which reading the events avoids.

### 2. Subscriptions queue events; a thread per subscription delivers them

A subscription becomes `{ id, sender: std::sync::mpsc::Sender<Event> }`. Under the mutex,
`persist_all` and `open` only push to the sender, which costs a clone and keeps
persist-before-deliver and order. A thread started for each subscription:

1. blocks on `recv()` for the first event;
2. collects more with `recv_timeout` until 16 ms after the first one;
3. sends the collected events as one `Vec<Event>` over the Tauri `Channel`;
4. ends when the sender is dropped or a channel send fails.

`std::sync::mpsc` and `std::thread` need no new dependency and behave the same on Windows,
macOS and Linux. One thread per open subscription is cheap: with unsubscribing, the UI holds
one per open Conversation. A failed push to a sender (its thread ended) removes the
subscription, as failed sends do today.

`subscribe_conversation(after_seq)` keeps its meaning and uses the same queue: under the
mutex it pushes the stored events after `after_seq` to the new sender and registers it, so
the thread delivers them, batched, outside the mutex.

*Alternative considered:* sending without the 16 ms window, as soon as anything is queued.
A fast model then still causes dozens of deliveries and React updates per second for each
open Conversation; one per frame is as many as the screen can show.

### 3. Explicit unsubscribing, and a reset when the UI starts

- `unsubscribe_conversation(project_id, subscription_id)` removes the subscription, which
  drops its sender; its thread ends and drops the `Channel`.
- `reset_subscriptions()` removes every subscription in every open Project. The UI calls it
  once when it starts, before opening anything, so subscriptions left by a reloaded view are
  dropped. There is a single window, so this never removes another view's subscriptions.
- In `useConversation`, the effect's cleanup waits for the open request to finish and then
  unsubscribes, so a StrictMode remount or a fast switch never leaves a subscription behind.

### 4. Commands and channel payload

| Command | Returns | Channel carries |
|---|---|---|
| `open_conversation(project_id, conversation_id, on_events)` | `OpenedConversation` | `Event[]` |
| `subscribe_conversation(project_id, conversation_id, after_seq, on_events)` | `subscription_id` | `Event[]` |
| `unsubscribe_conversation(project_id, subscription_id)` | nothing | |
| `reset_subscriptions()` | nothing | |

A batch can reach the UI before `open_conversation` resolves. The UI buffers batches until
it has the snapshot, then applies them; `applyEvent` already ignores any event whose `seq`
isn't the next one, so an event the snapshot already holds is skipped.

### 5. The UI loads a snapshot and applies batches

- `ConversationStore.load(snapshot)` replaces the state and notifies once.
- `ConversationStore.applyBatch(events)` folds every event with `applyEvent`, then notifies
  once if anything changed.
- `MessageItem` is wrapped in `React.memo`; its props are `projectId` and the message object.
- `ChatView` scrolls to the end only when the number of messages or the last message
  changes, not on every state change.

### 6. Equivalence test across Rust and TypeScript

The snapshot is built in Rust and the replay in TypeScript, so the test spans both:

- `src-tauri/fixtures/replay.json`, next to the existing `events.json`, holds a
  hand-written Conversation's events and the opened state they must give: deltas, a Step in
  a loop, an approval that pauses and resumes a reply, an answered component, reactions added
  and removed, a failed reply, a stored Jev answer, and a reply still streaming with progress.
  It is written by hand because event IDs and timestamps differ on every run, so a fixture
  generated by a test could not be compared from one run to the next.
- A Rust test persists the fixture's events through the store in order, opens the
  Conversation and asserts the returned `last_seq` and messages equal the fixture's opened
  state.
- `eventStore.test.ts` folds the fixture's events with `applyEvent` and asserts the result
  deeply equals the same opened state.

A change on either side that breaks equality fails one of the two tests.

## Risks / Trade-offs

- **The snapshot and the reducer can drift** as new event types are added. → The fixture
  test fails when they disagree; adding an event type means extending the fixture.
- **Large component data makes a large snapshot.** Charts and tables can hold up to 2 MiB
  each, all sent on open. → Accepted for now: it is sent once, instead of the same data in a
  replay. Loading component data lazily is a possible follow-up.
- **Up to 16 ms more latency per event.** → Not visible; the screen redraws at about that
  rate.
- **A thread per subscription.** → Bounded by open Conversations; unsubscribing and the
  start-up reset keep it to one or two.
- **The channel payload changes from one event to a list.** → Only this app's UI reads it,
  and both sides change in the same pull request.
