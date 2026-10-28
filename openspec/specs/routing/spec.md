# routing Specification

## Purpose

Defines which Mini-Me answers a user message, whether it also reacts to it, and whether
the message needs earlier context, as decided by Typesafe's Jev, and what happens when Jev
is unsure or cannot be asked.

## Requirements

### Requirement: A mentioned Mini-Me answers
When a user message contains one or more Mini-Me mentions, the first mentioned Mini-Me
SHALL answer it, and Jev SHALL NOT be asked which Mini-Me answers.

#### Scenario: Mention
- **WHEN** the user sends "@Scribe summarize #notes.txt"
- **THEN** Scribe answers

#### Scenario: Two mentions
- **WHEN** the user sends "@Assistant and @Scribe, hello"
- **THEN** Assistant answers, and only Assistant

### Requirement: Mini-Me reactions are persisted with the reply
A reaction chosen by Jev SHALL be persisted when the reply starts, as `reaction.added` with
payload `{ message_id, emoji, by: { kind: "mini_me", id: <Mini-Me ID> } }` on the user's
message, from the answering Mini-Me. A reaction SHALL NOT replace the reply.

#### Scenario: Thanks
- **WHEN** the user sends "@Scribe thanks, summarize #notes.txt" and Jev picks 👍
- **THEN** Scribe adds 👍 to the user's message and also replies with the summary

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
- **THEN** Assistant answers

### Requirement: Jev decides on a reaction
The answering Mini-Me SHALL react with Jev's `reaction` choice when that choice is not `none`
and its confidence is at or above the threshold. Without a decision, there SHALL be no
reaction, and the reply SHALL go ahead. A reply from the fallback SHALL react under the
same rule, from Assistant.

#### Scenario: Jev unavailable with a mention
- **WHEN** Typesafe cannot be reached and the user sends "@Scribe thanks, summarize
  #notes.txt"
- **THEN** Scribe replies with the summary and adds no reaction

#### Scenario: Fallback with a reaction
- **WHEN** Jev's `mini_me` confidence is 0.3 and it picks 👍 with confidence 0.8
- **THEN** Assistant answers and adds 👍 to the user's message

### Requirement: Context answer is passed on
Jev's `needs_context` answer SHALL be passed to the reply's run as `context.needs_context`,
and from there to each of its Trait calls: `true`, `false`, or `null` when no decision is
available. Adapters MAY ignore it.

#### Scenario: Passed to the call
- **WHEN** Jev answers `needs_context` with `yes`
- **THEN** the reply's `run.start` carries `context.needs_context: true`

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

### Requirement: Assistant answers below the threshold or without Jev
When the message mentions no Mini-Me and Jev's confidence is below the threshold, Jev
chooses a Mini-Me the library does not have, or no decision is available, Assistant SHALL
answer. "No decision" means no Typesafe key, Typesafe unreachable, an error, or no answer
within 10 seconds.

#### Scenario: Unsure
- **WHEN** the threshold is 0.5 and Jev's confidence is 0.3
- **THEN** Assistant answers, without the user being asked to mention a Mini-Me

#### Scenario: No Typesafe key
- **WHEN** no Typesafe key is saved and the user sends "Create a sample CSV file" without a
  mention
- **THEN** Assistant answers

#### Scenario: Unknown choice
- **WHEN** Jev answers with an ID that is not a Mini-Me in the library
- **THEN** Assistant answers

### Requirement: A reply that cannot start is explained
When the chosen or fallback Mini-Me's reply cannot be started, the core SHALL persist a
complete reply from `{ kind: "system", id: "routing" }` saying the reply could not be
started and why.

#### Scenario: Sidecar not running
- **WHEN** routing picks a Mini-Me but the sidecar is not running
- **THEN** the message gets a note from Mini-Me saying the reply could not be started
