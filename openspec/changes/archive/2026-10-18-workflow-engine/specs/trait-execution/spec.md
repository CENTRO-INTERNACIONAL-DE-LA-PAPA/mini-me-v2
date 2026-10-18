# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
- **WHEN** a condition's decision sends `asset.read`, `component.add` or `asset.write`
- **THEN** the core answers with error code `unknown_method`; only `secret.get` is allowed

#### Scenario: Unknown method or ended run
- **WHEN** the sidecar sends a method the core does not know, or a request for a call whose
  run has ended
- **THEN** the core answers with `unknown_method` or `call_not_active`

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
The link protocol version SHALL be 5. The Rust core and the sidecar both implement adapter
discovery, Mini-Me runs (`run.start`, `run.cancel` and the `run.*` and `step.*` frames), the
routing request, and the `component.add` and `asset.write` requests. A side still at an
earlier version SHALL be reported as a version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 5 starts a sidecar that sends
  `hello` with protocol 4
- **THEN** the sidecar is shown as `incompatible`, naming both versions
