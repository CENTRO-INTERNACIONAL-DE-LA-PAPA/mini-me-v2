# Spec Delta

## MODIFIED Requirements

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

### Requirement: Copying a debug record
"Copy as JSON" SHALL copy the block's records to the clipboard as indented JSON, exactly as
stored, with IDs rather than names: Jev's record, or a reply's records as a list.

#### Scenario: Copying Jev's record
- **WHEN** the user clicks "Copy as JSON" in an expanded "[DEBUG] Jev" block
- **THEN** the clipboard holds the record's `asked`, `answers` and `error` as JSON

#### Scenario: Copying a reply's records
- **WHEN** the user clicks "Copy as JSON" in an expanded "[DEBUG] AI" block
- **THEN** the clipboard holds the reply's records, in order, as a JSON list

## ADDED Requirements

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
