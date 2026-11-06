# Spec Delta

## Purpose
Developer debug records: what a Project keeps to explain how a message was handled, such as
what Jev was asked and answered, kept apart from the Conversation's events and shown only in
Developer mode.

## ADDED Requirements

### Requirement: Debug records are kept apart from events
A Project SHALL keep debug records in its own database, apart from its Conversations' events.
Each record SHALL belong to one message of a Conversation and have a `kind` (`jev`) and a JSON
`content`. Opening a Conversation SHALL read no debug record. Deleting a Conversation SHALL
delete its records. The records stay in the Project's database file inside its Project folder,
so nothing is written outside the folder.

#### Scenario: Opening a Conversation
- **WHEN** the UI opens a Conversation whose messages have debug records
- **THEN** the opened messages carry none of them, and no record is read

#### Scenario: Deleting a Conversation
- **WHEN** the user deletes a Conversation whose messages have debug records
- **THEN** those records are deleted with it

### Requirement: Reading a debug record
The UI SHALL read one message's record of one `kind` on request, and SHALL get either its
`content` or nothing when the message has none.

#### Scenario: A message without a record
- **WHEN** the UI asks for the `jev` record of a message sent while both Jev switches were off
- **THEN** it gets nothing

### Requirement: Jev's record
After each Jev request, while Developer mode is on and "[DEBUG] Show Jev's answers" or
"[DEBUG] Show what Jev was asked" is on, the core SHALL store a `jev` record for the user
message, with `content` `{ asked, answers, error }`:
- `asked` is what was sent to Jev, `{ state, questions }`, where `questions` maps each question
  ID to `{ instructions, options }` and `options` maps each option to the text Jev read for it;
  `null` when no request reached Jev or "[DEBUG] Show what Jev was asked" is off;
- `answers` maps each question ID to `{ choice, confidence, probabilities }`; `null` when Jev
  did not answer or "[DEBUG] Show Jev's answers" is off;
- `error` is `{ code, message }` when Jev did not answer and "[DEBUG] Show Jev's answers" is on,
  else `null`.

#### Scenario: Jev answers
- **WHEN** Developer mode and both Jev switches are on and Jev answers `mini_me`, `reaction`
  and `needs_context`
- **THEN** the message's `jev` record holds the state and the three questions as sent, and
  the three answers

#### Scenario: Only the answers
- **WHEN** "[DEBUG] Show Jev's answers" is on and "[DEBUG] Show what Jev was asked" is off
- **THEN** the record holds the answers, and `asked` is `null`

#### Scenario: Typesafe does not answer in time
- **WHEN** "[DEBUG] Show Jev's answers" is on and the Jev request times out
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
"Copy as JSON" SHALL copy the record's `content` to the clipboard as indented JSON, exactly as
stored, with IDs rather than names.

#### Scenario: Copying Jev's record
- **WHEN** the user clicks "Copy as JSON" in an expanded "[DEBUG] Jev" block
- **THEN** the clipboard holds the record's `asked`, `answers` and `error` as JSON

### Requirement: Clearing debug records
"[DEBUG] Debug data" on the Developer page SHALL delete every debug record of the open Project
after the user confirms, and SHALL be unavailable while no Project is open.

#### Scenario: Clearing
- **WHEN** a Project is open and the user clears its debug data
- **THEN** every "[DEBUG] Jev" block in it says "Nothing recorded for this message" when
  expanded
