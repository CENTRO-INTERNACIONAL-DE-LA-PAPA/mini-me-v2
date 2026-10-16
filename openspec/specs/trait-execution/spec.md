# trait-execution Specification

## Purpose

Defines the single interface through which the Rust core discovers and runs Traits in the
sidecar, whatever their provider: Trait discovery, the lifecycle of a Trait call, streamed
output, progress, cancellation, error isolation and the requests a Trait can make to the
Rust core while it runs.

## Requirements

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
During a call or a routing request, the sidecar SHALL be able to send `core.request`,
payload `{ request_id, call_id, method, params }`, where `call_id` is the call's ID or the
routing request's `route_id`. The core SHALL answer each with `core.response`, payload
`{ request_id, result }` or `{ request_id, error: { code, message } }`. A request for a call
or routing request that is not running SHALL fail with code `call_not_active`; an unknown
method with `unknown_method`. A routing request SHALL only be able to use `secret.get`.

#### Scenario: Request after the call ended
- **WHEN** the sidecar sends `core.request` for a call that has ended
- **THEN** the core answers with error code `call_not_active`

#### Scenario: Asset read from a routing request
- **WHEN** the sidecar sends `asset.read` with a routing request's `route_id`
- **THEN** the core answers with error code `unknown_method`

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
The frame type `call.input_requested` (asking the user for input during a call) is reserved
for later versions. The sidecar SHALL NOT send it in this protocol version, and the core
SHALL ignore it. Interactive Components are added with the `component.add` request, never
with a frame, so the core also ignores a `call.component` frame.

#### Scenario: Reserved frame received
- **WHEN** the core receives `call.input_requested` or `call.component`
- **THEN** it ignores the frame and the call continues

### Requirement: Echo adapter
The sidecar SHALL provide the `echo` adapter, used by tests and development: its input is
`{ text }` and it streams that text back one word at a time, keeping the original
whitespace, then ends with `call.done`. It declares no providers and ignores `trait` and
`model`. In the built-in library only placeholder Traits use it.

#### Scenario: Echo output
- **WHEN** the `echo` adapter runs with the text "What causes late blight?"
- **THEN** its deltas concatenate to "What causes late blight?" and the call ends with
  `call.done`

### Requirement: Link protocol version
The link protocol version SHALL be 4: the Rust core and the sidecar both implement adapter
discovery, the `call.start` payload defined here, the routing request and the
`component.add` and `asset.write` requests. A side still at an earlier version SHALL be
reported as a version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 4 starts a sidecar that sends
  `hello` with protocol 3
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

### Requirement: Context carries the routing answer
`call.start`'s `context` SHALL include `needs_context`: `true`, `false`, or `null`, as the
routing decision for the message answered. Adapters MAY ignore it.

#### Scenario: Unknown
- **WHEN** a reply starts without a routing decision
- **THEN** its `call.start` has `context.needs_context: null`

### Requirement: Writing an Asset
During a call, the method `asset.write`, params `{ name, media_type, data }` with `data` the
base64 of the file's bytes (at most 32 MiB decoded), SHALL store the file in the call's
Project, register it as an Asset with source `generated`, add it to the reply with
`attachment.added`, and return `{ asset }` (`id`, `name`, `media_type`, `size_bytes`).

#### Scenario: Theory Store saved
- **WHEN** a Theorize call writes `theory-store.json` with media type `application/json`
- **THEN** the reply shows the attachment `theory-store.json`, and opening it shows the
  written content

#### Scenario: After the reply ended
- **WHEN** the sidecar sends `asset.write` for a call that has ended
- **THEN** the core answers with error code `call_not_active`, and no file is written

### Requirement: Written Assets stay in the Project
The core SHALL choose where a written Asset is stored: `assets/<asset id>/<name>` inside
the call's Project, resolved through the Project-folder confinement check. A `name` that is
empty, longer than 255 characters, or holds a path separator, `..` or a character that
Windows forbids in file names SHALL fail with `invalid_input`, and nothing is written. No
file path SHALL be sent to the sidecar.

#### Scenario: Name with a path
- **WHEN** a Trait writes an Asset named `../../notes.txt`
- **THEN** the request fails with `invalid_input`, and nothing is written inside or outside
  the Project

#### Scenario: Same name twice
- **WHEN** two calls each write `theory-store.json`
- **THEN** both files are kept, each with its own Asset ID

### Requirement: Scout Trait
The Trait library SHALL contain *Scout*, run by the `prompt` adapter, with instructions
asking for a varied set of directions worth exploring on the topic of the message and the
text Assets it references, each with a line on why it may be worth pursuing. The directions
are leads to look into, not hypotheses or conclusions. Its input is `{ text }`, as for
*Summarize*.

#### Scenario: Directions on a topic
- **WHEN** the user sends "@Explorer late blight resistance in native potato varieties"
- **THEN** Explorer's reply lists several distinct directions to explore, each with a
  short reason, and states none of them as a finding

### Requirement: Refute Trait
The Trait library SHALL contain *Refute*, run by the `prompt` adapter, with instructions
asking it to argue that the statement in the message is wrong, using only the message, the
text Assets it references, and widely established knowledge. It names the weakest points
of the statement and the evidence that would settle them. It does not invent sources or
results; when it finds no strong counter-argument, it says so. Its input is `{ text }`.

#### Scenario: Challenging a claim
- **WHEN** the user sends "@Skeptic fungicide rotation alone prevents late blight
  resistance"
- **THEN** Skeptic's reply argues against the claim, naming its weakest points and what
  evidence would settle them

#### Scenario: Nothing to argue against
- **WHEN** the message holds no statement or claim
- **THEN** the reply says in one sentence that it needs a statement to argue against

### Requirement: Plan Trait
The Trait library SHALL contain *Plan*, run by the `prompt` adapter, with instructions
asking for a plan for the project or goal in the message: an ordered list of steps, or an
architecture of parts and how they connect when the goal is a system. Each step says what
it produces. It uses referenced text Assets and states the assumptions it makes. Its input
is `{ text }`.

#### Scenario: Planning a study
- **WHEN** the user sends "@Planner a two-season field trial of three blight-resistant
  varieties"
- **THEN** Planner's reply is an ordered list of steps, each saying what it produces, with
  the assumptions it made

### Requirement: Wonder Trait
The Trait library SHALL contain *Wonder*, run by the `prompt` adapter, with instructions
asking for open questions that take the topic of the message, and the text Assets it
references, further. The questions are varied (mechanism, context, method, consequence),
each specific enough to research, and they are not answered. Its input is `{ text }`.

#### Scenario: Questions on a topic
- **WHEN** the user sends "@Inquirer how temperature affects Phytophthora infestans
  sporulation"
- **THEN** Inquirer's reply is a list of specific open questions on the topic, without
  answers

### Requirement: Experiment Trait
The Trait library SHALL contain *Experiment*, run by the `prompt` adapter, with
instructions asking for the design of an experiment that tests the hypothesis in the
message: the variables and how they are measured, the treatments and controls, the
experimental design and replication, the data to collect, how it will be analysed, and the
result that would support or reject the hypothesis. When the message holds no testable
hypothesis, it proposes one and says so. Its input is `{ text }`.

#### Scenario: Designing an experiment
- **WHEN** the user sends "@Experimenter early planting reduces late blight severity"
- **THEN** Experimenter's reply describes the variables, treatments and controls, design,
  data, analysis and the result that would support or reject the hypothesis

#### Scenario: No hypothesis given
- **WHEN** the user sends "@Experimenter late blight and irrigation"
- **THEN** the reply proposes a testable hypothesis, says it did so, and designs an
  experiment for it
