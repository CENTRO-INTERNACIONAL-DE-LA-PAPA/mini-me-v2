# trait-execution Specification

## Purpose

Defines the single interface through which the Rust core discovers and runs Traits in the
sidecar, whatever their provider: Trait discovery, the lifecycle of a Trait call, streamed
output, progress, cancellation, error isolation and the requests a Trait can make to the
Rust core while it runs.

## Requirements

### Requirement: Trait discovery
After the handshake the Rust core SHALL send `traits.list` (empty payload) and the sidecar
SHALL answer with `traits` whose payload is `{ traits: [TraitInfo] }`. Each `TraitInfo` SHALL
have `id` (stable kebab-case string), `name` (imperative verb in Title Case), `description`,
`input_schema` (a JSON Schema object) and `providers` (list of provider IDs it may request
secrets for, possibly empty).

#### Scenario: Echo is discovered
- **WHEN** the sidecar becomes ready
- **THEN** the core knows a Trait with `id` `echo`, `name` `Echo`, an `input_schema` and an
  empty `providers` list

#### Scenario: Trait IDs are unique
- **WHEN** the sidecar's Traits are listed
- **THEN** no two Traits share an `id`

### Requirement: Starting a Trait call
The Rust core SHALL start a Trait call with `call.start`, payload
`{ call_id, trait_id, input, context }`, where `call_id` is a new UUIDv7, `input` is a JSON
object and `context` is `{ project_id, conversation_id, message }` with `message` the user
message being answered, including its attachments and Text Components.

#### Scenario: Unknown Trait
- **WHEN** the core starts a call with a `trait_id` the sidecar does not have
- **THEN** the sidecar ends the call with `call.error` and error code `unknown_trait`

### Requirement: Concurrent Trait calls
The sidecar SHALL run Trait calls concurrently. Every frame about a call SHALL carry its
`call_id`, and frames of one call SHALL NOT affect any other call.

#### Scenario: Two Conversations at once
- **WHEN** replies are being produced in two Conversations at the same time
- **THEN** both stream at the same time and each receives only its own text

### Requirement: Streamed output
While a call runs, the sidecar SHALL send its text output as `call.delta`, payload
`{ call_id, text }`, in the order the Trait produced it.

#### Scenario: Echo streams word by word
- **WHEN** *Echo* runs with the text "late blight spreads"
- **THEN** the core receives `call.delta` frames whose texts concatenate to
  "late blight spreads"

### Requirement: Progress updates
The sidecar SHALL let a Trait report progress with `call.progress`, payload `{ call_id, label, fraction }`,
where `label` is a short human-readable text and `fraction` is a number from 0 to 1 or
`null` when unknown. The sidecar SHALL send at most four progress frames per second per call,
keeping the latest when it drops one.

#### Scenario: Frequent progress is thinned
- **WHEN** a Trait reports progress 100 times within one second
- **THEN** the core receives at most four `call.progress` frames for that second, the last
  one carrying the latest label and fraction

### Requirement: Exactly one final outcome
Every call SHALL end with exactly one of `call.done` (`{ call_id }`), `call.error`
(`{ call_id, error: { code, message } }`) or `call.cancelled` (`{ call_id }`). The Rust core
SHALL ignore, and log, any frame for a call that has already ended.

#### Scenario: Late frame after the end
- **WHEN** the core receives `call.delta` for a call that already received `call.done`
- **THEN** the frame is ignored and nothing is persisted for it

### Requirement: Per-call error boundary
When a Trait raises an error, the sidecar SHALL end that call with `call.error`, code
`trait_error` and a message that contains no traceback, write the traceback to standard
error, and keep running every other call and the sidecar itself.

#### Scenario: Failing Trait
- **WHEN** one Trait raises an error while another call is streaming
- **THEN** the first call ends with `call.error` code `trait_error`, the other call keeps
  streaming and the sidecar stays ready

### Requirement: Cooperative cancellation
The Rust core SHALL cancel a call with `call.cancel`, payload `{ call_id }`. The sidecar SHALL
signal the Trait, which stops at its next opportunity, and SHALL end the call with
`call.cancelled`. If no final frame arrives within five seconds, the core SHALL consider the
call cancelled and ignore its later frames.

#### Scenario: Echo is cancelled
- **WHEN** the core cancels an *Echo* call halfway through its text
- **THEN** the sidecar sends `call.cancelled` and no further `call.delta` for that call

#### Scenario: Trait ignores cancellation
- **WHEN** a Trait keeps running for more than five seconds after `call.cancel`
- **THEN** the core treats the call as cancelled and ignores any later frame for it, and the
  sidecar keeps serving other calls

### Requirement: Requests from a Trait to the Rust core
During a call, the sidecar SHALL be able to send `core.request`, payload
`{ request_id, call_id, method, params }`. The core SHALL answer each with `core.response`,
payload `{ request_id, result }` or `{ request_id, error: { code, message } }`. A request for
a call that is not running SHALL fail with code `call_not_active`; an unknown method with
`unknown_method`.

#### Scenario: Request after the call ended
- **WHEN** the sidecar sends `core.request` for a call that has ended
- **THEN** the core answers with error code `call_not_active`

### Requirement: Reading an Asset
The method `asset.read`, params `{ asset_id, offset, length }`, SHALL return
`{ data, size_bytes, eof }`: `data` is the base64 of up to `length` bytes (capped at 1 MiB)
from `offset`. Only Assets of the call's Project are readable; the core resolves them through
its Project-folder confinement check and never sends a file path to the sidecar.

#### Scenario: Reading a large Asset in chunks
- **WHEN** a Trait reads a 2.5 MiB Asset of its call's Project in 1 MiB chunks
- **THEN** it receives three responses whose decoded data concatenates to the file, the last
  with `eof` true

#### Scenario: Asset from another Project
- **WHEN** a Trait asks for an Asset ID that belongs to a different Project
- **THEN** the request fails with code `not_found`

### Requirement: Reserved frame types
The frame types `call.input_requested` (asking the user for input during a call) and
`call.component` (Interactive Component output) are reserved for later versions. The sidecar
SHALL NOT send them in this protocol version, and the core SHALL ignore them.

#### Scenario: Reserved frame received
- **WHEN** the core receives `call.component`
- **THEN** it ignores the frame and the call continues

### Requirement: Echo Trait
The sidecar SHALL provide the *Echo* Trait (`id` `echo`), whose input is `{ text }` and which
streams that text back one word at a time, keeping the original whitespace, then ends with
`call.done`. It declares no providers.

#### Scenario: Echo output
- **WHEN** *Echo* runs with the text "What causes late blight?"
- **THEN** its deltas concatenate to "What causes late blight?" and the call ends with
  `call.done`
