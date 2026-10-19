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
Inside the sidecar, a Trait Step SHALL run its Trait's adapter as one Trait call. The call
gets its `call_id` from `step.started`, its Trait from the run's `traits`, its `model` from
the run (or `null` when the adapter declares no providers) and the run's `input`. Its
context is `{ project_id, conversation_id, message, needs_context, mini_me_name, steps }`,
with `steps` the earlier Step outputs as Workflows define them.

#### Scenario: Unknown Trait
- **WHEN** the core starts a run whose `traits` name an `adapter` the sidecar does not have
- **THEN** the sidecar ends the run with `run.error` and error code `unknown_adapter`

### Requirement: Concurrent Trait calls
The sidecar SHALL run Mini-Me runs, and the Trait calls of parallel branches, concurrently.
Every frame about a run SHALL carry its `run_id`, and frames of one run SHALL NOT affect any
other run.

#### Scenario: Two Conversations at once
- **WHEN** replies are being produced in two Conversations at the same time
- **THEN** both stream at the same time and each receives only its own text

### Requirement: Streamed output
While a run runs, the sidecar SHALL send the text of the reply as `run.delta`, payload
`{ run_id, text }`, in order, as Workflows define the reply's text.

#### Scenario: Echo streams word by word
- **WHEN** a one-Step Workflow runs *Echo* with the text "late blight spreads"
- **THEN** the core receives `run.delta` frames whose texts concatenate to
  "late blight spreads"

### Requirement: Progress updates
The sidecar SHALL let a Trait report progress with `run.progress`, payload `{ run_id, label,
fraction }`, where `label` is a short human-readable text and `fraction` is a number from 0
to 1 or `null` when unknown. The sidecar SHALL send at most four progress frames per second
per Trait call, keeping the latest when it drops one.

#### Scenario: Frequent progress is thinned
- **WHEN** a Trait reports progress 100 times within one second
- **THEN** the core receives at most four `run.progress` frames for that call in that
  second, the last one carrying the latest label and fraction

### Requirement: Exactly one final outcome
Every run SHALL end with exactly one of `run.done` (`{ run_id }`), `run.paused`,
`run.error` (`{ run_id, error: { code, message } }`) or `run.cancelled` (`{ run_id }`). The
Rust core SHALL ignore, and log, any frame for a run that has already ended.

#### Scenario: Late frame after the end
- **WHEN** the core receives `run.delta` for a run that already received `run.done`
- **THEN** the frame is ignored and nothing is persisted for it

### Requirement: Per-call error boundary
When a Trait raises an error, the sidecar SHALL end that run with `run.error`, code
`trait_error` and a message that contains no traceback. It SHALL cancel the run's other
Trait calls, write the traceback to standard error, and keep running every other run and
the sidecar itself. A Trait's own error code, such as `model_not_set`, SHALL end the run
with that code.

#### Scenario: Failing Trait
- **WHEN** one Trait raises an error while another run is streaming
- **THEN** the first run ends with `run.error` code `trait_error`, the other run keeps
  streaming and the sidecar stays ready

### Requirement: Cooperative cancellation
The Rust core SHALL cancel a run with `run.cancel`, payload `{ run_id }`. The sidecar SHALL
signal each of the run's Trait calls, which stop at their next opportunity, start no further
Step, and end the run with `run.cancelled`. If no final frame arrives within five seconds,
the core SHALL consider the run cancelled and ignore its later frames.

#### Scenario: Echo is cancelled
- **WHEN** the core cancels a run of *Echo* halfway through its text
- **THEN** the sidecar sends `run.cancelled` and no further `run.delta` for that run

#### Scenario: Trait ignores cancellation
- **WHEN** a Trait keeps running for more than five seconds after `run.cancel`
- **THEN** the core treats the run as cancelled and ignores any later frame for it, and the
  sidecar keeps serving other runs

### Requirement: Requests from a Trait to the Rust core
During a Trait call, a model decision or a routing request, the sidecar SHALL be able to
send `core.request`, payload `{ request_id, call_id, method, params }`. Here `call_id` is
the call's ID from `step.started`, or the routing request's `route_id`. The core SHALL
answer each with `core.response`, payload `{ request_id, result }` or `{ request_id, error:
{ code, message } }`.

#### Scenario: Request after the call ended
- **WHEN** the sidecar sends `core.request` for a call whose Step has completed
- **THEN** the core answers with error code `call_not_active`

#### Scenario: Asset read from a routing request
- **WHEN** the sidecar sends `asset.read` with a routing request's `route_id`
- **THEN** the core answers with error code `unknown_method`

#### Scenario: Model decision
- **WHEN** a condition's decision sends `asset.read`, `component.add`, `asset.write`,
  `conversation.results` or `component.read`
- **THEN** the core answers with error code `unknown_method`; only `secret.get` is allowed

#### Scenario: Unknown method or ended run
- **WHEN** the sidecar sends a method the core does not know, or a request for a call whose
  run has ended
- **THEN** the core answers with `unknown_method` or `call_not_active`

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
whitespace, then returns. It declares no providers and ignores `trait` and `model`. In the
built-in library only placeholder Traits use it.

#### Scenario: Echo output
- **WHEN** a one-Step Workflow runs the `echo` adapter with the text "What causes late
  blight?"
- **THEN** its `run.delta` texts concatenate to "What causes late blight?" and the run ends
  with `run.done`

### Requirement: Link protocol version
The link protocol version SHALL be 6. The Rust core and the sidecar both implement adapter
discovery, Mini-Me runs (`run.start`, `run.cancel` and the `run.*` and `step.*` frames), the
routing request, and the `component.add`, `asset.write`, `conversation.results` and
`component.read` requests. A side still at an earlier version SHALL be reported as a
version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 6 starts a sidecar that sends
  `hello` with protocol 5
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

### Requirement: Starting a Mini-Me run
The core SHALL start a run with `run.start`, payload `{ run_id, mini_me, workflow, traits,
model, input, context, resume }`:
- `run_id` is a new UUIDv7, and `mini_me` is `{ id, name }`;
- `traits` lists `{ id, name, instructions, adapter }` for each Trait the Workflow uses;
- `model` is `{ provider, model }` from Settings, or `null`;
- `input` is the input of every Trait Step;
- `resume` is `null`, or the saved state to resume from.

#### Scenario: Traits of a run
- **WHEN** the core starts a run of Investigator
- **THEN** `traits` lists *Scout*, *Wonder*, *Plan*, *Refute* and *Experiment*, each once,
  and `resume` is `null`

### Requirement: Step frames
The sidecar SHALL send `step.started` (`{ run_id, step_id, call_id }`) and `step.completed`
(`{ run_id, step_id, output }`) for each Step it runs. `call_id` is a new UUID for each
Trait call and each model decision of a condition or loop, and `null` for other Steps. An
approval Step SHALL get `step.started` only.

#### Scenario: Trait Step
- **WHEN** a run's *Plan* Step runs
- **THEN** the core receives `step.started` with a `call_id`, then `step.completed` with
  *Plan*'s text as `output`

### Requirement: Pausing a run
At an approval Step, the sidecar SHALL send `run.paused`, payload `{ run_id, step_id,
output, state }`. `output` is the Workflow's output so far, or `null`, and `state` is an
opaque string of at most 16 MiB that holds everything needed to resume. The run then ends in
the sidecar. A larger `state` SHALL fail the reply with `state_too_large`.

#### Scenario: Paused at an approval
- **WHEN** Investigator reaches its approval Step
- **THEN** the core receives `step.started` for that Step, then `run.paused`, and nothing
  else for that run

### Requirement: Resuming a run
To resume, the core SHALL send `run.start` with a new `run_id`, the saved Workflow,
Traits, input and context of the paused run, and `resume` `{ state, step_id, approved:
true }`. The sidecar SHALL continue after that approval Step, or end with `run.error` code
`resume_failed` when it cannot read `state`.

#### Scenario: Approved run
- **WHEN** the core resumes a run paused at Investigator's approval
- **THEN** the next `step.started` is for the *Experiment* Step
