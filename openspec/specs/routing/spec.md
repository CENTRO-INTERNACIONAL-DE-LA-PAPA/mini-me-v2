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
- `reaction`: options `none`, `👍`, `🎉`, `💛`, `😄`, `😡`, `😢`, `🥔`, `🤔`, `😮`, `💪`,
  `🌱`, `😅`, `🙏`, `☕`, `🧪`, `🌧️`, each described by when it fits;
- `needs_context`: options `yes`, `no`;
- `file`: only when the message references and attaches no Asset and its Conversation has
  at least one; one option per Asset of the Conversation, keyed by its ID and described by
  its name, plus `none`.

#### Scenario: Message without a mention
- **WHEN** the user sends "summarize #field-notes.txt"
- **THEN** one Jev request is sent with the `mini_me`, `reaction` and `needs_context`
  questions

#### Scenario: Message with a mention
- **WHEN** the user sends "@Scribe summarize #field-notes.txt"
- **THEN** one Jev request is sent with only the `reaction` and `needs_context` questions

#### Scenario: Untagged file in a Conversation with files
- **WHEN** the Conversation holds `field-trial.csv` and `field-trial-cleaned.csv` and the
  user sends "@Validator check the cleaned data"
- **THEN** one Jev request is sent with the `reaction`, `needs_context` and `file`
  questions, the `file` options being the two Assets and `none`

#### Scenario: Surprising result
- **WHEN** the user sends "wow, I didn't expect yield to drop that much"
- **THEN** the `reaction` question offers 😮, described as the user being surprised by a
  result

#### Scenario: Conversation without files
- **WHEN** the Conversation holds no Asset and the user sends "check the data"
- **THEN** the Jev request has no `file` question

### Requirement: What is sent to Jev
The state sent to Jev SHALL be `{ message, files, recent }`:
- `message` is the message content without its Mini-Me mentions;
- `files` lists the names of its attached and referenced Assets;
- `recent` lists the last four earlier messages of the Conversation, oldest first, leaving
  out the app's own notes, each as `{ name, content, files }`: its author's name ("You" for
  the user), the first 200 characters of its content without its Interactive Components,
  and the names of its files.

The `file` question's options SHALL carry only each Asset's ID and name. No file content,
Interactive Component data, API key or other Project data SHALL be sent.

#### Scenario: Referenced file
- **WHEN** the user sends "summarize #field-notes.txt"
- **THEN** Jev receives the name `field-notes.txt` and not the file's content

#### Scenario: Follow-up
- **WHEN** Curator has just replied and the user sends "now remove the empty rows"
- **THEN** `recent` ends with Curator's reply, named "Curator", and its first 200
  characters

#### Scenario: Reply with a table
- **WHEN** an earlier reply holds a table Interactive Component
- **THEN** that reply's entry in `recent` holds its text and none of the table's rows

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
app settings. It SHALL apply to Jev's `mini_me` answer and to its `reaction` answer. It SHALL
be shown, as "[DEBUG] Jev's confidence threshold" in Settings → General, only while
Developer mode is on, and its saved
value SHALL apply whether Developer mode is on or off.

#### Scenario: Changing the threshold
- **WHEN** the user sets the threshold to 0.8 and Jev chooses a Mini-Me with confidence 0.7
- **THEN** Assistant answers

#### Scenario: Developer mode off
- **WHEN** the threshold is 0.8 and the user turns Developer mode off
- **THEN** the threshold is no longer shown in Settings, and a Mini-Me Jev chooses with
  confidence 0.7 still does not answer

### Requirement: Jev decides on a reaction
The answering Mini-Me SHALL react with Jev's `reaction` choice when that choice is not `none`,
its confidence is at or above the threshold, and a random draw passes the reaction chance of
one in two, so that a Conversation about one topic does not get the same reaction on every
message. Without a decision, there SHALL be no reaction, and the reply SHALL go ahead. A
reply from the fallback SHALL react under the same rule, from Assistant.

#### Scenario: Jev unavailable with a mention
- **WHEN** Typesafe cannot be reached and the user sends "@Scribe thanks, summarize
  #notes.txt"
- **THEN** Scribe replies with the summary and adds no reaction

#### Scenario: Fallback with a reaction
- **WHEN** Jev's `mini_me` confidence is 0.3, it picks 👍 with confidence 0.8, and the draw
  passes
- **THEN** Assistant answers and adds 👍 to the user's message

#### Scenario: Draw fails
- **WHEN** Jev picks 🥔 with confidence 0.9 and the draw does not pass
- **THEN** the reply adds no reaction

### Requirement: Context answer is passed on
Jev's `needs_context` answer SHALL be passed to the reply's run as `context.needs_context`,
and from there to each of its Trait calls: `true`, `false`, or `null` when no decision is
available. Adapters MAY ignore it.

#### Scenario: Passed to the call
- **WHEN** Jev answers `needs_context` with `yes`
- **THEN** the reply's `run.start` carries `context.needs_context: true`

### Requirement: Routing request on the link
The core SHALL ask for a decision with `route.start`, payload
`{ route_id, state, mini_mes, files, ask }`:
- `route_id` is a new UUIDv7;
- `mini_mes` is `[{ id, name, description }]`;
- `files` is `[{ id, name }]`, the options of the `file` question, newest first, and empty
  when `ask` does not hold `file`;
- `ask` is the list of question IDs.

The sidecar SHALL answer with exactly one of:
- `route.done { route_id, answers }`, where each answer is `{ choice, confidence,
  probabilities }`;
- `route.error { route_id, error: { code, message } }`.

#### Scenario: Decision
- **WHEN** the core sends `route.start` asking `reaction` and `needs_context`
- **THEN** the sidecar answers `route.done` with an answer for each of the two questions

#### Scenario: File question
- **WHEN** the core sends `route.start` asking `file` with two `files`
- **THEN** the `file` Choice offers each file's ID and `none`, and `route.done` holds an
  answer for `file`

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

### Requirement: Jev picks the file above the threshold
When Jev's `file` answer is one of the Conversation's Assets with a confidence at or above
the confidence threshold, that Asset SHALL be the reply's picked file. A `none` answer, a
lower confidence, an unknown ID or no answer SHALL leave the reply without a picked file.
The user's message SHALL NOT change.

#### Scenario: Confident pick
- **WHEN** the threshold is 0.5 and Jev answers `file` with `field-trial-cleaned.csv` at
  0.8
- **THEN** the reply's picked file is `field-trial-cleaned.csv`, and the user's message
  still references no file

#### Scenario: Unsure
- **WHEN** the threshold is 0.5 and Jev answers `file` with `field-trial.csv` at 0.3
- **THEN** the reply has no picked file

#### Scenario: Tagged file wins
- **WHEN** the user sends "@Validator check #field-trial.csv"
- **THEN** Jev is not asked `file`, and the reply has no picked file

### Requirement: Picked file is passed on
The reply's picked file SHALL be passed to its run as `context.file`, `{ asset_id, name }`,
or `null` without one, and from there to each of its Trait calls, as `context.needs_context`
is. A reply that answers a comment thread SHALL have `context.file: null`.

#### Scenario: Passed to the call
- **WHEN** Jev picks `field-trial-cleaned.csv`
- **THEN** the reply's `run.start` carries `context.file` with that Asset's ID and name

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
