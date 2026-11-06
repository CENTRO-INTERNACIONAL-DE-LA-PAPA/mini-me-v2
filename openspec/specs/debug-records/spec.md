# debug-records Specification

## Purpose
Developer debug records: what a Project keeps to explain how a message was handled, such as
what Jev was asked and answered, kept apart from the Conversation's events and shown only in
Developer mode.

## Requirements

### Requirement: Debug records are kept apart from events
A Project SHALL keep debug records in its own database, apart from its Conversations' events.
Each record SHALL belong to one message of a Conversation and have a `kind` (`jev` or `reply`)
and a JSON `content`. A message MAY hold several records of one kind, kept in the order they
were written. Opening a Conversation SHALL read no debug record. Deleting a Conversation SHALL
delete its records. The records stay in the Project's database file inside its Project folder,
so nothing is written outside the folder.

#### Scenario: Opening a Conversation
- **WHEN** the UI opens a Conversation whose messages have debug records
- **THEN** the opened messages carry none of them, and no record is read

#### Scenario: Deleting a Conversation
- **WHEN** the user deletes a Conversation whose messages have debug records
- **THEN** those records are deleted with it

### Requirement: Reading a debug record
The UI SHALL read one message's records of one `kind` on request, in the order they were
written, and SHALL get an empty list when the message has none.

#### Scenario: A message without a record
- **WHEN** the UI asks for the `jev` records of a message sent while both Jev switches were off
- **THEN** it gets an empty list

### Requirement: Jev's record
After each Jev request, while Developer mode is on and "Show Jev's answers" or
"Show what Jev was asked" is on, the core SHALL store a `jev` record for the user
message, with `content` `{ asked, answers, error }`:
- `asked` is what was sent to Jev, `{ state, questions }`, where `questions` maps each question
  ID to `{ instructions, options }` and `options` maps each option to the text Jev read for it;
  `null` when no request reached Jev or "Show what Jev was asked" is off;
- `answers` maps each question ID to `{ choice, confidence, probabilities }`; `null` when Jev
  did not answer or "Show Jev's answers" is off;
- `error` is `{ code, message }` when Jev did not answer and "Show Jev's answers" is on,
  else `null`.

#### Scenario: Jev answers
- **WHEN** Developer mode and both Jev switches are on and Jev answers `mini_me`, `reaction`
  and `needs_context`
- **THEN** the message's `jev` record holds the state and the three questions as sent, and
  the three answers

#### Scenario: Only the answers
- **WHEN** "Show Jev's answers" is on and "Show what Jev was asked" is off
- **THEN** the record holds the answers, and `asked` is `null`

#### Scenario: Typesafe does not answer in time
- **WHEN** "Show Jev's answers" is on and the Jev request times out
- **THEN** the record holds `answers` `null` and the error `jev_timeout`

### Requirement: The "[DEBUG] Jev" block
While Developer mode is on and either Jev switch is on, every user message SHALL show a
collapsed "[DEBUG] Jev" block. Expanding it SHALL read the message's `jev` record and show
the parts it holds whose switch is on:
- each answered question in plain words ("Who answers?" for `mini_me`, "React with an emoji?"
  for `reaction`, "Needs earlier messages?" for `needs_context`, "Which file?" for `file`, and
  the question ID for any other), the chosen option with its confidence, and below it, in a
  lighter colour, the other options with their probabilities, highest first;
- options by their Mini-Me's or file's name where they are IDs;
- the error, when Jev did not answer;
- what Jev was asked: the state, and each question's instructions and options with their text;
- a "Copy as JSON" button.

A message without a record SHALL show "Nothing recorded for this message" when expanded.

#### Scenario: Reading an answer
- **WHEN** the user expands "[DEBUG] Jev" under a message Jev routed to Plotter with 92%
- **THEN** the block shows "Who answers?" with Plotter 92%, and the other Mini-Mes with their
  probabilities on a lighter line below

#### Scenario: A message sent before the switch was on
- **WHEN** the user expands "[DEBUG] Jev" under a message sent while both Jev switches were off
- **THEN** the block says "Nothing recorded for this message"

### Requirement: Copying a debug record
"Copy as JSON" SHALL copy the block's records to the clipboard as indented JSON, exactly as
stored, with IDs rather than names: Jev's record, or a reply's records as a list.

#### Scenario: Copying Jev's record
- **WHEN** the user clicks "Copy as JSON" in an expanded "[DEBUG] Jev" block
- **THEN** the clipboard holds the record's `asked`, `answers` and `error` as JSON

#### Scenario: Copying a reply's records
- **WHEN** the user clicks "Copy as JSON" in an expanded "[DEBUG] AI" block
- **THEN** the clipboard holds the reply's records, in order, as a JSON list

### Requirement: Clearing debug records
"Debug data" on the Developer page SHALL delete every debug record of the open Project
after the user confirms, and SHALL be unavailable while no Project is open.

#### Scenario: Clearing
- **WHEN** a Project is open and the user clears its debug data
- **THEN** every "[DEBUG] Jev" block in it says "Nothing recorded for this message" when
  expanded

### Requirement: A reply's debug records
While Developer mode and at least one of "Show what the AI read", "Show model call details" and
"Show tool calls" are on, each model call the sidecar makes for a reply SHALL be stored as a
`reply` record of the reply, and each tool a model calls as another, in the order they happen.
This covers prompt-based Traits (each round of tool calls is its own model call), data Traits
choosing what to run, the Dataverse search and Workflow decisions. A model call's `content` is
`{ type: "model_call", id, step, trait, continues, messages, provider, model, duration_ms,
tokens_in, tokens_out }`, and a tool call's is `{ type: "tool_call", call, name, args, result }`.

#### Scenario: A prompt-based Trait that calls a tool
- **WHEN** all three switches are on and Assistant answers after reading a table with
  `read_table`
- **THEN** the reply's records are a model call, the `read_table` tool call with its arguments
  and result, and a second model call that continues the first

#### Scenario: A data Trait
- **WHEN** "Show model call details" is on and Plotter draws a chart
- **THEN** the reply has one model call record, from the Step that ran *Plot*, with its provider,
  model, time and tokens

### Requirement: What each part of a reply record holds
Each part SHALL be stored only while its switch is on, and is `null` otherwise:
- "Show what the AI read": `messages`, the call's input as `{ role, content }` entries, with a
  model message's `tool_calls` and a tool result's `tool_call_id`. When the call's input begins
  with the whole input of the previous model call of the same Trait call, `continues` is that
  call's `id` and `messages` holds only the entries after it.
- "Show model call details": `provider`, `model`, `duration_ms`, and `tokens_in` and
  `tokens_out`, each `null` when the provider reports none.
- "Show tool calls": the tool call records, with `call` the `id` of the model call that asked
  for them, and the full `args` and `result` the model got. With the switch off, no tool call
  record is stored.

`id`, `step` (the Step's name) and `trait` (the Trait's name) SHALL always be stored.

#### Scenario: A second round
- **WHEN** "Show what the AI read" is on and a prompt-based Trait's second round sends the
  first round's input plus the model's tool request and the tool's result
- **THEN** the second model call has `continues` set to the first's `id`, and `messages` holds
  only the tool request and the result

#### Scenario: Only the details
- **WHEN** only "Show model call details" is on
- **THEN** each model call record has `messages` `null`, and no tool call is stored

### Requirement: The "[DEBUG] AI" block
While Developer mode and at least one reply debug switch are on, every reply SHALL show a
collapsed "[DEBUG] AI" block. Expanding it SHALL read the reply's `reply` records and show one
section per model call, in order:
- its Step and Trait;
- its provider, model, time in seconds, and tokens in and out, when stored;
- "What the AI read", collapsed, with its number of messages, and when expanded the whole input,
  each message with its role, rebuilt from the calls it continues;
- the tools it asked for, each with its arguments and result.

A reply without records SHALL show "Nothing recorded for this reply" when expanded. The block
SHALL have a "Copy as JSON" button.

#### Scenario: Reading a reply
- **WHEN** the user expands "[DEBUG] AI" under a reply of Assistant that read a table
- **THEN** the block shows two model calls of the *Assist* Step, and the `read_table` call under
  the first

#### Scenario: A reply sent before the switches were on
- **WHEN** the user expands "[DEBUG] AI" under a reply written while every reply switch was off
- **THEN** the block says "Nothing recorded for this reply"
