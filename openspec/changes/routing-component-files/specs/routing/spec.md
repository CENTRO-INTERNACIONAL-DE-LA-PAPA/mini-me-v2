# Spec Delta

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
  its name and by the tables and charts of the Conversation shown from it, newest first, each
  by its kind and title, plus `none`.

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

#### Scenario: A file shown as a chart
- **WHEN** Plotter drew "Yield by variety" from `field-trial.csv` and the user sends
  "@Plotter make that chart a bar chart"
- **THEN** the `file` option for `field-trial.csv` reads "The file field-trial.csv, shown as
  the chart Yield by variety"

### Requirement: Routing request on the link
The core SHALL ask for a decision with `route.start`, payload
`{ route_id, state, mini_mes, files, ask }`:
- `route_id` is a new UUIDv7;
- `mini_mes` is `[{ id, name, description }]`;
- `files` is `[{ id, name, shown_as }]`, the options of the `file` question, newest first, and
  empty when `ask` does not hold `file`; `shown_as` lists the tables and charts of the
  Conversation shown from that file, newest first, as `{ kind, title }`, and holds no rows or
  other component data;
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
