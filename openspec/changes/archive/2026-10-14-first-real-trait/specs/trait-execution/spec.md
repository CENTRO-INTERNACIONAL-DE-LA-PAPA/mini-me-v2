# Spec Delta

## MODIFIED Requirements

### Requirement: Trait discovery
After the handshake the Rust core SHALL send `adapters.list` (empty payload) and the sidecar
SHALL answer with `adapters` whose payload is `{ adapters: [AdapterInfo] }`. Each
`AdapterInfo` SHALL have `id` (stable kebab-case string), `description`, `input_schema` (a
JSON Schema object) and `providers` (list of provider IDs it may request secrets for,
possibly empty). The Traits themselves are defined in the Rust core's Trait library; each
names the adapter that runs it.

#### Scenario: Echo is discovered
- **WHEN** the sidecar becomes ready
- **THEN** the core knows an adapter with `id` `echo`, an `input_schema` and an empty
  `providers` list

#### Scenario: Trait IDs are unique
- **WHEN** the sidecar's adapters are listed
- **THEN** no two adapters share an `id`

### Requirement: Starting a Trait call
The Rust core SHALL start a Trait call with `call.start`, payload
`{ call_id, adapter, trait, model, input, context }`, where:
- `call_id` is a new UUIDv7;
- `adapter` is the adapter ID named by the Trait's definition;
- `trait` is `{ id, name, instructions }` from the Trait library, with `instructions` a
  string or `null`;
- `model` is `{ provider, model }` for adapters that declare providers, otherwise `null`;
- `input` is a JSON object;
- `context` is `{ project_id, conversation_id, message }`, with `message` the user message
  being answered, including its attachments and Text Components.

#### Scenario: Unknown Trait
- **WHEN** the core starts a call with an `adapter` the sidecar does not have
- **THEN** the sidecar ends the call with `call.error` and error code `unknown_adapter`

### Requirement: Echo Trait
The sidecar SHALL provide the `echo` adapter, which runs the *Echo* Trait: its input is
`{ text }` and it streams that text back one word at a time, keeping the original
whitespace, then ends with `call.done`. It declares no providers and ignores `trait` and
`model`.

#### Scenario: Echo output
- **WHEN** *Echo* runs with the text "What causes late blight?"
- **THEN** its deltas concatenate to "What causes late blight?" and the call ends with
  `call.done`

## ADDED Requirements

### Requirement: Link protocol version 2
The link protocol version SHALL be 2: the Rust core and the sidecar both implement adapter
discovery and the `call.start` payload defined here, and a side still at version 1 SHALL be
reported as a version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 2 starts a sidecar that sends
  `hello` with protocol 1
- **THEN** the sidecar is shown as `incompatible`, naming both versions

### Requirement: Summarize Trait
The Trait library SHALL contain *Summarize*, run by the `prompt` adapter, with instructions
asking for a short, faithful summary in the language of the material. Its input is
`{ text }`, the user message's content without its Mini-Me mentions. It SHALL summarize that
text together with the content of every text Asset the message references or attaches.

#### Scenario: Summarizing a referenced file
- **WHEN** the user sends "@Scribe summarize #field-notes.txt"
- **THEN** Scribe's reply streams a summary of the content of `field-notes.txt`

#### Scenario: Unsupported Asset
- **WHEN** the message references an Asset that is not valid UTF-8 text, such as a PDF
- **THEN** the reply summarizes the rest and says which Assets it could not read
