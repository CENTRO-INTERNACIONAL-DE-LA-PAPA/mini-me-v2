# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Asked to mention a Mini-Me below the threshold or without Jev
**Reason**: A request should never stop at routing; Assistant answers instead.
**Migration**: Replaced by "Assistant answers below the threshold or without Jev". Earlier
ask-for-mention notes stay in existing Conversations and are still left out of history.
