# event-protocol Specification

## Purpose

Defines the single event format and the delivery guarantees that every interaction in
Mini-Me relies on, so that the UI, the Rust core and future processes or peers exchange the
same events in the same order.

## Requirements

### Requirement: Event envelope
Every event SHALL be a JSON object with these fields: `id` (UUIDv7 string), `type` (dotted
event type string), `v` (envelope version, integer, currently `1`), `project_id` (UUID
string), `conversation_id` (UUID string), `seq` (positive integer), `ts` (Unix epoch
milliseconds), `origin` (object with `installation_id` and `user_id`, both UUID strings) and
`payload` (object whose shape is defined by `type`).

#### Scenario: A persisted event has every envelope field
- **WHEN** the Rust core persists any event
- **THEN** the stored and delivered event contains all envelope fields with the types above
- **AND** `v` equals `1`

#### Scenario: Event IDs are UUIDv7
- **WHEN** two events are created one after the other on the same installation
- **THEN** both IDs are valid UUIDv7 values
- **AND** the second ID sorts after the first

### Requirement: Origin identifies who produced the event
The `origin` of an event SHALL be the installation and user on whose machine the event was
produced, including events produced by a reply on that machine.

#### Scenario: Locally produced events carry the local origin
- **WHEN** the user sends a message and a reply is streamed on the same installation
- **THEN** every resulting event has `origin.installation_id` and `origin.user_id` equal to
  the local installation and user IDs

### Requirement: Per-Conversation sequence numbers
The Rust core SHALL assign each event a `seq` when it persists it. Within a Conversation,
sequence numbers SHALL start at 1 and increase by exactly 1 with each event, with no gaps or
duplicates. Producers of events SHALL NOT choose the sequence number.

#### Scenario: Sequence numbers are contiguous
- **WHEN** a Conversation receives five events
- **THEN** their sequence numbers are 1, 2, 3, 4 and 5 in the order they were persisted

#### Scenario: Sequences are independent per Conversation
- **WHEN** events are persisted in two different Conversations
- **THEN** each Conversation's sequence starts at 1 independently of the other

### Requirement: Persist before deliver
The Rust core SHALL deliver an event to any subscriber only after the event is durably
stored in the Project's database. If storing fails, the event SHALL NOT be delivered and the
action that produced it SHALL report an error.

#### Scenario: Delivered events survive a restart
- **WHEN** the UI has received an event and the app is then closed and reopened
- **THEN** the event is still present in the Conversation's history with the same `id` and
  `seq`

#### Scenario: A storage failure is not delivered
- **WHEN** storing an event fails
- **THEN** no subscriber receives that event
- **AND** the action that produced it returns an error to the UI

### Requirement: Ordered delivery and catch-up
A subscriber SHALL be able to subscribe to a Conversation from any sequence number. The Rust
core SHALL first deliver every stored event with a greater sequence number, in order, and
then every new event as it is persisted, in order, without gaps or duplicates. Events SHALL
be delivered in batches: each delivery is a list of one or more consecutive events, in
sequence order.

#### Scenario: Subscribing from the start
- **WHEN** the UI subscribes to a Conversation from sequence 0
- **THEN** it receives every stored event in sequence order, followed by new events

#### Scenario: Catching up after a gap
- **WHEN** the UI last saw sequence 12 and subscribes again from 12
- **THEN** it receives events 13 onwards, in order, and never receives events 1 to 12 again

#### Scenario: No event is lost during subscription
- **WHEN** a new event is persisted while a subscription is replaying stored events
- **THEN** the subscriber receives that event exactly once, after the replayed events

#### Scenario: Events arrive in batches
- **WHEN** a reply streams 200 `message.delta` events within one second
- **THEN** the subscriber receives them in fewer than 200 deliveries
- **AND** the events across all deliveries are in sequence order, with no gaps or duplicates

### Requirement: Forward compatibility
Consumers of events SHALL ignore events whose `type` they do not recognize, and SHALL ignore
payload fields they do not recognize, without failing.

#### Scenario: Unknown event type
- **WHEN** the UI receives an event with a `type` it does not know
- **THEN** it skips the event, keeps processing later events and records its `seq` as seen

#### Scenario: Unknown payload field
- **WHEN** a known event carries an extra payload field
- **THEN** the event is processed normally and the extra field is ignored

### Requirement: Events are immutable
Once persisted, an event SHALL NOT be modified or deleted. A change to existing state SHALL
be expressed as a new event.

#### Scenario: State changes append events
- **WHEN** a reply that was streaming is cancelled
- **THEN** a new `message.cancelled` event is appended
- **AND** the earlier `message.created` and `message.delta` events remain unchanged

### Requirement: Open a Conversation from its stored state
The UI SHALL be able to open a Conversation in one request that returns its messages as
stored, each with its content, status, attachments, Text Components, Interactive Components
(with their data and answer), Steps, reactions, failure, Jev's answer and, while streaming,
its progress, together with the latest stored sequence number. The same request SHALL
subscribe the UI from that sequence number, without gaps or duplicates.

#### Scenario: A long Conversation opens without a replay
- **WHEN** the UI opens a Conversation whose replies took 5,000 events to stream
- **THEN** it receives the Conversation's messages and the latest sequence number from the
  one request
- **AND** none of the stored events is delivered to it

#### Scenario: An event persisted while opening is received once
- **WHEN** an event is persisted in a Conversation while the UI opens it
- **THEN** either the returned messages include that event's effect and the returned sequence
  number is at least its `seq`, or the event is delivered after opening, never both

### Requirement: Delivery does not hold up persistence
Sending events to a subscriber SHALL NOT delay persisting events, in the same or another
Conversation of the Project. The Rust core SHALL gather a subscriber's pending events for at
most about 16 milliseconds before delivering them as one batch.

#### Scenario: Opening a Conversation while another streams
- **WHEN** a reply streams in one Conversation while the user opens a long Conversation in
  the same Project
- **THEN** the streaming reply's events keep being persisted and delivered without pausing
  until the other Conversation has opened

### Requirement: End a subscription
The UI SHALL be able to end a subscription it holds. After that, the Rust core SHALL deliver
no further events to it. When the UI starts, it SHALL ask the Rust core to end every
subscription left by an earlier view of the app, such as before a window reload.

#### Scenario: Closing a Conversation ends its subscription
- **WHEN** the user switches from one Conversation to another
- **THEN** the first Conversation's subscription is ended, and its later events are not
  delivered to the UI until it is opened again

#### Scenario: A reload leaves no subscriptions behind
- **WHEN** the app's window is reloaded after Conversations were opened
- **THEN** the Rust core holds only the subscriptions the reloaded view opens
