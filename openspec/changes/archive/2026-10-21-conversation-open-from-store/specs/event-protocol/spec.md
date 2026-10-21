# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
