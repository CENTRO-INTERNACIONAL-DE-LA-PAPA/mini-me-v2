# Spec Delta

## MODIFIED Requirements

### Requirement: A mentioned Mini-Me answers
When a user message contains one or more Mini-Me mentions, the first mentioned Mini-Me
SHALL answer it, and Jev SHALL NOT be asked which Mini-Me answers.

#### Scenario: Mention
- **WHEN** the user sends "@Scribe summarize #notes.txt"
- **THEN** Scribe answers

#### Scenario: Two mentions
- **WHEN** the user sends "@Echo and @Scribe, hello"
- **THEN** Echo answers, and only Echo

### Requirement: Mini-Me reactions are persisted with the reply
A reaction chosen by Jev SHALL be persisted when the reply starts, as `reaction.added` with
payload `{ message_id, emoji, by: { kind: "mini_me", id: <Mini-Me ID> } }` on the user's
message, from the answering Mini-Me. A reaction SHALL NOT replace the reply.

#### Scenario: Thanks
- **WHEN** the user sends "@Scribe thanks, summarize #notes.txt" and Jev picks 👍
- **THEN** Scribe adds 👍 to the user's message and also replies with the summary

## ADDED Requirements

### Requirement: One Jev request per message
For each user message, the Rust core SHALL ask the sidecar for one routing decision before
the reply starts. The sidecar SHALL send one request to Typesafe's Jev (model `jev-latest`)
with the message as the state and these Choice questions:
- `mini_me`: only when the message mentions no Mini-Me; one option per Mini-Me, keyed by
  its ID and described by its name and description;
- `reaction`: options `none`, `👍`, `🎉`, `❤️`;
- `needs_context`: options `yes`, `no`.

#### Scenario: Message without a mention
- **WHEN** the user sends "summarize #field-notes.txt"
- **THEN** one Jev request is sent with the `mini_me`, `reaction` and `needs_context`
  questions

#### Scenario: Message with a mention
- **WHEN** the user sends "@Scribe summarize #field-notes.txt"
- **THEN** one Jev request is sent with only the `reaction` and `needs_context` questions

### Requirement: What is sent to Jev
The state sent to Jev SHALL be `{ message, files }`:
- `message` is the message content without its Mini-Me mentions;
- `files` lists the names of its attached and referenced Assets.

No file content, earlier message, API key or other Project data SHALL be sent.

#### Scenario: Referenced file
- **WHEN** the user sends "summarize #field-notes.txt"
- **THEN** Jev receives the name `field-notes.txt` and not the file's content

### Requirement: Jev picks the Mini-Me above the threshold
When the message mentions no Mini-Me and Jev's `mini_me` answer has a confidence at or
above the confidence threshold, the Mini-Me Jev chose SHALL answer.

#### Scenario: Confident choice
- **WHEN** the threshold is 0.5 and Jev chooses Scribe with confidence 0.9
- **THEN** Scribe answers without the user being asked

### Requirement: Asked to mention a Mini-Me below the threshold or without Jev
When the message mentions no Mini-Me and either Jev's confidence is below the threshold, or
no decision is available, the core SHALL start no Trait call. "No decision" means no
Typesafe key, Typesafe unreachable, an error, or no answer within 10 seconds. Instead it
SHALL persist a complete reply from `{ kind: "system", id: "routing" }` asking the user to
mention a Mini-Me with `@`. The reply SHALL say whether Jev was unsure or could not be
asked, and SHALL name a Mini-Me as an example.

#### Scenario: Unsure
- **WHEN** the threshold is 0.5 and Jev's confidence is 0.3
- **THEN** the message gets a reply saying Mini-Me is not sure who should answer and to
  mention one with @, and no Trait runs

#### Scenario: No Typesafe key
- **WHEN** no Typesafe key is saved and the user sends a message without a mention
- **THEN** the reply says a Mini-Me could not be chosen, points to the Typesafe key in
  Settings, and asks to mention a Mini-Me with @

### Requirement: Choosing a status
While the routing decision for a message is pending, the UI SHALL show "Choosing a
Mini-Me…" under the message and keep the composer disabled as during a reply.

#### Scenario: Waiting for Jev
- **WHEN** the user has sent a message and Jev has not answered yet
- **THEN** "Choosing a Mini-Me…" is shown and a second message cannot be sent

### Requirement: Confidence threshold setting
Settings SHALL have a confidence threshold between 0 and 1, default 0.5, stored with the
app settings. It SHALL apply to Jev's `mini_me` answer and to its `reaction` answer.

#### Scenario: Changing the threshold
- **WHEN** the user sets the threshold to 0.8 and Jev chooses a Mini-Me with confidence 0.7
- **THEN** the message gets the reply asking to mention a Mini-Me

### Requirement: Jev decides on a reaction
The answering Mini-Me SHALL react with Jev's `reaction` choice when that choice is not `none`
and its confidence is at or above the threshold. Without a decision, there SHALL be no
reaction, and a mentioned Mini-Me's reply SHALL go ahead. The reply asking to mention a
Mini-Me SHALL come without a reaction.

#### Scenario: Jev unavailable with a mention
- **WHEN** Typesafe cannot be reached and the user sends "@Scribe thanks, summarize
  #notes.txt"
- **THEN** Scribe replies with the summary and adds no reaction

### Requirement: Context answer is passed on
Jev's `needs_context` answer SHALL be passed to the reply's call as
`context.needs_context`: `true`, `false`, or `null` when no decision is available. Adapters
MAY ignore it.

#### Scenario: Passed to the call
- **WHEN** Jev answers `needs_context` with `yes`
- **THEN** the reply's `call.start` carries `context.needs_context: true`

### Requirement: Routing request on the link
The core SHALL ask for a decision with `route.start`, payload
`{ route_id, state, mini_mes, ask }`:
- `route_id` is a new UUIDv7;
- `mini_mes` is `[{ id, name, description }]`;
- `ask` is the list of question IDs.

The sidecar SHALL answer with exactly one of:
- `route.done { route_id, answers }`, where each answer is `{ choice, confidence,
  probabilities }`;
- `route.error { route_id, error: { code, message } }`.

#### Scenario: Decision
- **WHEN** the core sends `route.start` asking `reaction` and `needs_context`
- **THEN** the sidecar answers `route.done` with an answer for each of the two questions

### Requirement: Routing requests get the Typesafe key
The sidecar SHALL get the Typesafe key with `secret.get` for provider `typesafe`, using
`route_id` as the `call_id`, once per routing request.

#### Scenario: No key
- **WHEN** the core has no Typesafe key
- **THEN** the sidecar answers `route.error` with code `secret_unavailable`

## REMOVED Requirements

### Requirement: Jev stand-in picks a Mini-Me
**Reason**: Jev picks the Mini-Me ("Jev picks the Mini-Me above the threshold"); when Jev is
unsure or unavailable, the user is asked to mention one.
**Migration**: None; messages without a mention are no longer answered by Echo by default.

### Requirement: Jev stand-in decides on a reaction
**Reason**: Jev's `reaction` answer replaces the keyword rules ("Jev decides on a reaction").
**Migration**: None.
