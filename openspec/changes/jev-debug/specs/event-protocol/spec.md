# Spec Delta

## MODIFIED Requirements

### Requirement: Open a Conversation from its stored state
The UI SHALL be able to open a Conversation in one request that returns its messages as
stored, each with its content, status, attachments, Text Components, Interactive Components
(with their data and answer), Steps, reactions, failure and, while streaming, its progress,
together with the latest stored sequence number. The same request SHALL subscribe the UI from
that sequence number, without gaps or duplicates.

#### Scenario: A long Conversation opens without a replay
- **WHEN** the UI opens a Conversation whose replies took 5,000 events to stream
- **THEN** it receives the Conversation's messages and the latest sequence number from the
  one request
- **AND** none of the stored events is delivered to it

#### Scenario: An event persisted while opening is received once
- **WHEN** an event is persisted in a Conversation while the UI opens it
- **THEN** either the returned messages include that event's effect and the returned sequence
  number is at least its `seq`, or the event is delivered after opening, never both
