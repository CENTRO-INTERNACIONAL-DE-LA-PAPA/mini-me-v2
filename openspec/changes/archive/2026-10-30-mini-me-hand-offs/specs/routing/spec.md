## ADDED Requirements

### Requirement: The hand-off tool
A prompt-based Trait's model SHALL hand off with the hand-off tool, whose arguments are
`mini_me`, a Mini-Me's name; `request`, what to ask; and `file`, optionally the ID of one of
the Conversation's files. The prompt SHALL list the call's `mini_mes` by name and description
under "Mini-Mes you can hand off to". The sidecar SHALL send the core `reply.hand_off {
mini_me_id, request, asset_id }` with the call's `call_id`, and give the model any refusal as
the tool's result.

#### Scenario: Assistant hands off to Profiler
- **WHEN** Assistant's model, answering "what's in #field-trial.csv?", calls hand-off with
  `mini_me: "Profiler"`, `request: "profile this table"` and the file's ID
- **THEN** the sidecar sends `reply.hand_off` with Profiler's ID, the request and the file's
  ID

#### Scenario: Unknown name
- **WHEN** the model calls hand-off with `mini_me: "Theorizer"` and no Mini-Me has that name
- **THEN** nothing is sent to the core, and the tool's result names the Mini-Mes it can
  choose

### Requirement: The core accepts one hand-off per reply
The core SHALL accept `reply.hand_off` once per reply, for a Mini-Me of the library other than
the reply's own, with a file of the Conversation or none. It SHALL refuse it with
`hand_off_not_allowed` and a message saying why for a reply that answers a Mini-Me's message
(a reply a hand-off started) or a comment in a thread.

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
- **WHEN** a Mini-Me answering a comment calls hand-off
- **THEN** the request fails with `hand_off_not_allowed`

### Requirement: An accepted hand-off shows on the reply
When the core accepts a hand-off, it SHALL add a `hand-off` component to the reply, which
shows under the reply's text once the reply stops streaming.

#### Scenario: Card under the reply
- **WHEN** Assistant's model hands off to Profiler with `field-trial.csv`
- **THEN** Assistant's reply shows a hand-off card with Profiler, the request and
  `field-trial.csv`

### Requirement: The hand-off starts the other Mini-Me
After a reply with an accepted hand-off completes, the core SHALL start the chosen Mini-Me's
reply to it, without asking Jev, with the request as input, the handed file as its picked file
(`context.file`), and `context.needs_context: true`. A reply that failed or was stopped SHALL
start nothing.

#### Scenario: Profiler answers
- **WHEN** Assistant's reply with a hand-off to Profiler for `field-trial.csv` completes
- **THEN** Profiler's reply to it starts with the input "profile this table" and profiles
  `field-trial.csv`

#### Scenario: Stopped reply
- **WHEN** the user stops a reply after its model called hand-off
- **THEN** no other reply starts

#### Scenario: Mention in the text
- **WHEN** a reply's text says "you could ask @Plotter for a chart" and its model calls no
  tool
- **THEN** no other reply starts

### Requirement: The Mini-Me list is passed on
Every run SHALL carry `context.mini_mes`, `[{ id, name, description }]`, every Mini-Me of the
library, passed to each of its Trait calls.

#### Scenario: Any reply
- **WHEN** a reply's run starts
- **THEN** its `run.start` carries every Mini-Me in `context.mini_mes`
