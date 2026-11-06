# Spec Delta

## MODIFIED Requirements

### Requirement: Confidence threshold setting
Settings SHALL have a confidence threshold between 0 and 1, default 0.5, stored with the
app settings. It SHALL apply to Jev's `mini_me` answer and to its `reaction` answer. It SHALL
be shown, as "Jev's confidence threshold" in Settings → Developer, only while Developer mode is
on, and its saved value SHALL apply whether Developer mode is on or off.

#### Scenario: Changing the threshold
- **WHEN** the user sets the threshold to 0.8 and Jev chooses a Mini-Me with confidence 0.7
- **THEN** Assistant answers

#### Scenario: Developer mode off
- **WHEN** the threshold is 0.8 and the user turns Developer mode off
- **THEN** the threshold is no longer shown in Settings, and a Mini-Me Jev chooses with
  confidence 0.7 still does not answer

### Requirement: Routing request on the link
The core SHALL ask for a decision with `route.start`, payload
`{ route_id, state, mini_mes, files, ask }`:
- `route_id` is a new UUIDv7;
- `mini_mes` is `[{ id, name, description }]`;
- `files` is `[{ id, name, components }]`, the options of the `file` question, newest first, and
  empty when `ask` does not hold `file`; `components` lists the tables and charts of the
  Conversation shown from that file, newest first, as `{ kind, title }`, and holds no rows or
  other component data;
- `ask` is the list of question IDs.

The sidecar SHALL answer with exactly one of:
- `route.done { route_id, answers, asked }`, where each answer is `{ choice, confidence,
  probabilities }`;
- `route.error { route_id, error: { code, message }, asked }`.

`asked` is the request sent to Jev, `{ state, questions }`, where `questions` maps each
question ID to `{ instructions, options }` and `options` maps each option to the text Jev
read for it; it is `null` in `route.error` when the request was not sent, such as when the
Typesafe key is missing.

#### Scenario: Decision
- **WHEN** the core sends `route.start` asking `reaction` and `needs_context`
- **THEN** the sidecar answers `route.done` with an answer for each of the two questions, and
  `asked` holding both questions with their instructions and options

#### Scenario: File question
- **WHEN** the core sends `route.start` asking `file` with two `files`
- **THEN** the `file` Choice offers each file's ID and `none`, and `route.done` holds an
  answer for `file`

#### Scenario: No Typesafe key
- **WHEN** the core sends `route.start` and no Typesafe key is saved
- **THEN** the sidecar answers `route.error` with `asked` `null`
