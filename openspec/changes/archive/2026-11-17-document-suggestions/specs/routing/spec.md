## MODIFIED Requirements

### Requirement: The core accepts one hand-off per reply
The core SHALL accept `reply.hand_off` once per reply, for a Mini-Me of the library other than
the reply's own, with a file of the Conversation or none, whether the reply answers a message in
a Conversation or a comment in a thread. It SHALL refuse it with `hand_off_not_allowed` and a
message saying why for a reply that answers a Mini-Me's message (a reply a hand-off started).

#### Scenario: Second hand-off
- **WHEN** a reply already handed off to Profiler and its model calls hand-off again
- **THEN** the request fails with `hand_off_not_allowed`, and only the first hand-off stands

#### Scenario: Its own Mini-Me
- **WHEN** Assistant's model hands off to Assistant
- **THEN** the request fails with `hand_off_not_allowed`

#### Scenario: No chain
- **WHEN** Profiler, answering Assistant's hand-off, calls hand-off
- **THEN** the request fails with `hand_off_not_allowed`

#### Scenario: Comment thread
- **WHEN** a Mini-Me answering a comment calls hand-off to Scribe
- **THEN** the hand-off is accepted, and Scribe answers next in the same thread

## ADDED Requirements

### Requirement: Routing a comment
A comment in a thread SHALL be routed as a message in a Conversation: one Jev request with the
`mini_me` question when it mentions no Mini-Me, and the `reaction` and `needs_context`
questions, but no `file` question, since the thread's document is already the reply's context.
Below the threshold, or without Jev, Assistant SHALL answer.

#### Scenario: A comment without a mention
- **WHEN** the user comments "too long" in a thread
- **THEN** one Jev request is sent with the `mini_me`, `reaction` and `needs_context`
  questions, and the Mini-Me it picks above the threshold answers
