## MODIFIED Requirements

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

## ADDED Requirements

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
