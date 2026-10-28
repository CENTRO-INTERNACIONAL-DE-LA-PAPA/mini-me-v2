# Design

## Context

See proposal.md for why. The current state that shapes the approach:

- **One Step per reply.** `Routing::start_reply` takes `workflow.steps.first()` and calls
  `TraitCalls::start`. That persists a streaming reply and sends `call.start` for that one
  Trait. `Library::problems()` refuses any Mini-Me without exactly one Step. A `Step` is
  only `{ trait }`.
- **Calls in the core.** `TraitCalls` keeps one `Call` per `call_id`. A `Call` holds the
  reply's message, the adapter, the provider and the allowed component kinds.
  - `handle` maps `call.*` frames to `conversations::append_*`, `complete_reply`,
    `fail_reply` and `cancel_reply`.
  - `answer` serves `core.request` by looking up the `Call`: `asset.read`,
    `conversation.history`, `secret.get`, `asset.write` and `component.add`.
- **Calls in the sidecar.** `Runner` runs one asyncio task per call through
  `adapter.run(ctx, input)` and sends `call.done`, `call.error` or `call.cancelled`.
  `CallContext.write` sends `call.delta`.
- **No LangGraph yet.** `langchain-core` 1.6 is already pinned, and the data Traits already
  use `with_structured_output(..., method="function_calling")` in `adapters/data/choose.py`.
- **Storage.** `project.sqlite` is at schema version 2, with migrations applied in one
  transaction (`db.rs`). Events are persisted together with their projection
  (`ProjectState::persist`). `recover_interrupted` fails replies left streaming.
- **UI.** Renderers get only `{ data }`. `MessageItem` shows the text, then the components,
  the progress line and the attachments. DESIGN.md already describes a "Workflow progress"
  card.

## Goals / Non-Goals

**Goals:**

- The Trait adapter interface (`Adapter.run(ctx, input)`) does not change. Every adapter
  works in any Step, unchanged.
- Durable state stays in the Rust core. The sidecar can restart at any time, and a paused
  run survives it.
- A one-Step Workflow behaves exactly as today: the same streaming, the same events and no
  progress card.
- LangGraph types appear only in the sidecar's `workflow` package.

**Non-Goals:**

- Running Steps in the core and having the sidecar run single Trait calls. That would put
  the graph logic in Rust, against the "compiled to LangGraph in the sidecar" invariant.
- A general graph format. Nested lists cover sequence, branching, loops and fan-out/fan-in.
  The visual editor (#16) can widen the format later, and nested lists stay valid.
- Inspecting or migrating the saved run state in the core.

## Decisions

### D1. The core sends a whole run; the sidecar owns its control flow

| Process | Owns |
|---|---|
| Rust core | Checks Workflows, picks the Mini-Me, persists every event, stores the paused-run state, answers `core.request`, and decides what each Trait call may access |
| Sidecar | Compiles the Workflow to LangGraph, runs Steps and model decisions, decides what streams into the reply, and builds the resume state |
| UI | Shows the progress card, the paused status and the approval, and sends the answer |

`run.start` carries the Workflow and the Traits it uses (`id`, `name`, `instructions`,
`adapter`). The sidecar therefore needs no library of its own, and a paused run resumes with
the definitions it started with.

- **Alternative: the core walks the Workflow and starts one `call.start` per Step.** The
  link would barely change. But loops, parallel joins and approval checkpoints would then be
  written in Rust, LangGraph would have nothing to do, and the protocol would grow
  Step-level control frames anyway.

### D2. The Workflow format: nested lists with a `type` tag

```json
{ "steps": [
  { "id": "open-up", "type": "parallel", "branches": [
    { "label": "Directions", "steps": [{ "id": "scout", "trait": "…a06" }] },
    { "label": "Questions",  "steps": [{ "id": "wonder", "trait": "…a09" }] } ] },
  { "id": "plan", "trait": "…a08" },
  { "id": "stress-test", "type": "loop", "max_iterations": 2,
    "question": "Did the latest critique find a serious flaw that the revised plan may still have?",
    "steps": [{ "id": "refute", "trait": "…a07" }, { "id": "revise", "trait": "…a08" }] },
  { "id": "testable", "type": "condition",
    "question": "Does the plan rest on a hypothesis that an experiment could test?",
    "branches": [
      { "label": "testable", "steps": [
        { "id": "ask", "type": "approval", "prompt": "Design an experiment to test this plan's hypothesis?" },
        { "id": "experiment", "trait": "…a10" } ] },
      { "label": "not testable", "steps": [{ "id": "more-questions", "trait": "…a09" }] } ] } ] }
```

In Rust, `Step` becomes an enum: `Trait { id, trait_id }`, `Approval`, `Condition`,
`Loop` and `Parallel`. Serde deserializes it as an internally tagged enum, and a missing
`type` means `trait`, via a small custom `Deserialize` that peeks at `type`. Control Steps
take an optional `label`, used for their name in the progress card.

`Library::problems()` walks the tree and applies the rules in the workflows spec. It
replaces the "exactly one Step" check. The thirteen existing Mini-Mes get Step IDs named
after their Trait (`"summarize"` and so on).

- **Alternative: a flat list of nodes plus edges.** That is closer to what the visual editor
  will draw. But it needs edge checks (reachability, a single entry point, cycles that
  aren't loops) that no one can author yet. Nested lists make every Workflow structured by
  construction.

### D3. Compiling to LangGraph

The sidecar's `workflow` package turns a parsed Workflow into a `StateGraph`:

- **State:** `outputs`, a list of `{ step_id, name, output, scope }` appended through a
  reducer; `loops`, a map from loop ID to iteration count; and `result`, the Workflow's
  output so far. `scope` is the path of parallel branches the output was made in. A Trait
  Step sees the outputs whose scope is a prefix of its own (the workflows spec's visibility
  rule), newest first and cut at 50,000 characters.
- **Trait Step:** a node that sends `step.started`, builds a `CallContext` with a fresh
  `call_id` and the visible outputs, awaits `adapter.run`, and sends `step.completed`.
- **Condition and loop decisions:** a node that calls `decide(...)` (D5), then
  `add_conditional_edges` to the branch or back to the loop's first Step.
- **Parallel Step:** fan-out edges to each branch's first node, and a join node with all
  branch ends as sources, so LangGraph waits for all of them. The join builds the
  `## <label>` output.
- **Approval:** a node that calls LangGraph's `interrupt()` (D4).

Node names are the Step IDs plus a suffix for decision nodes, so they are unique by the
library check.

**What streams.** At compile time each Trait Step is marked *final* if it is the last Step
of its list and that list is not inside a loop or parallel branch, recursing up through
conditions to the top level. A final Step's `CallContext.write` sends `run.delta`. Every
Step's text is also collected for `step.completed`. When the run ends, if the Workflow's
output came from a Step that wasn't final (for example a parallel join), the sidecar sends
it as one `run.delta` before `run.done`.

- **Alternative: hand-written asyncio orchestration.** It would be fewer lines for sequence
  and parallel. But checkpointing at an approval, and resuming inside a loop or branch, is
  exactly what LangGraph's checkpointer and `interrupt` provide. The invariant also names
  LangGraph.

### D4. Pausing and resuming: a serialized checkpoint, stored by the core

Each run compiles with an `InMemorySaver` and a `thread_id` equal to the reply's message ID.
On `interrupt()`, the sidecar reads the thread's latest checkpoint and pending writes from
the saver. It serializes them with LangGraph's `JsonPlusSerializer` (pickle fallback off,
since the state is plain JSON), wraps them in `{ "format": 1, "checkpoint": …, "writes": … }`
and base64-encodes the result. It sends `run.paused { run_id, step_id, output, state }` and
drops the run.

The core handles `run.paused` in one transaction: it adds the `approval` component, inserts
into `paused_runs` and persists `message.paused`. A crash therefore never leaves a paused
reply without its state.

On Approve, the core sends `run.start` with a new `run_id` and `resume: { state, step_id,
approved: true }`. The sidecar loads the checkpoint into a fresh saver, compiles the same
Workflow and continues with `Command(resume=True)`. Any failure to decode or match the state
ends the run with `resume_failed`. The model is taken from Settings at resume time, so a key
or model changed while paused applies.

- **Alternative: our own resume cursor** (the path to the approval plus the outputs so far),
  with a graph compiled to start there. It would not depend on LangGraph's checkpoint format,
  but re-entering a loop or a branch mid-way means reimplementing what the checkpointer
  does. The `format` field and `resume_failed` cover format drift across app updates.
- **Alternative: keep paused runs alive in the sidecar.** That breaks "the sidecar holds no
  durable state", and a pause can last days.

### D5. Model decisions

`workflow/decide.py` follows `adapters/data/choose.py`:
`chat_model(...).with_structured_output(Decision, method="function_calling")`, where
`Decision` is a Pydantic model with one `choice: Literal[...]` field built from the branch
labels, or from `repeat` and `stop`. The prompt is a short fixed system message ("You decide
which path a Mini-Me's Workflow takes next…"), then the question, the user's message and the
visible earlier outputs.

A decision runs under its own `call_id` (sent in `step.started`), so it can ask
`secret.get`. A reply that is not one of the choices raises `TraitError("invalid_decision")`.
Provider errors map through `provider_error` as for any Trait.

### D6. The core tracks runs and the calls inside them

`TraitCalls` becomes `Runs`. A `Run { run_id, project, conversation_id, message_id,
mini_me, workflow, provider, cancelling, calls }` replaces `Call`, and `calls` maps each
`call_id` from `step.started` to `{ step_id, kind: Trait { adapter, components } |
Decision }`.

`core.request` finds the run by `call_id` across runs, so every existing handler keeps its
checks. It uses the Step's Trait for `component.add` and secret providers. A decision may
use only `secret.get` for the run's provider. `step.completed` removes the call, so later
requests get `call_not_active`.

A run needs a model if any of its Traits' adapters declares providers, or if it has a
condition or loop. Otherwise `model_not_set` is raised before anything is sent, as today.

### D7. Storage: migration 3

```sql
CREATE TABLE message_steps (
    message_id TEXT NOT NULL REFERENCES messages(id),
    position   INTEGER NOT NULL,
    step_id    TEXT NOT NULL,
    type       TEXT NOT NULL,
    name       TEXT NOT NULL,
    output     TEXT,
    done       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (message_id, position)
);
ALTER TABLE components ADD COLUMN answer TEXT;
CREATE TABLE paused_runs (
    message_id TEXT PRIMARY KEY REFERENCES messages(id),
    step_id    TEXT NOT NULL,
    component_id TEXT NOT NULL,
    run        TEXT NOT NULL,  -- JSON: mini_me, workflow, traits, input, context
    output     TEXT,
    state      TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

- `step.started` inserts a row at the next `position`, and `step.completed` marks the
  latest row with that `step_id` as done, with its output. Loops repeat Step IDs, so the key
  is the position.
- `component.answered` sets `answer`.
- `message.paused` and `message.resumed` set `status`.
- `paused_runs` is operational state, not a projection. Replaying events never needs it,
  and it is deleted on answer or stop.
- `Message` gains `steps` (serde default empty).

### D8. Answering and stopping

A new IPC command, `answer_approval(project_id, message_id, component_id, approved)`:

1. Under the Project lock, it checks that the reply is `paused` and that `paused_runs`
   names this component. Otherwise it refuses with `not_paused`.
2. **Approve:** it checks that the sidecar is `ready` (else `sidecar_unavailable`). In one
   transaction it persists `component.answered`, `step.completed` for the approval and
   `message.resumed`, and deletes the row. Then it starts the resumed run. If the send
   fails, the reply fails with `sidecar_stopped`.
3. **Reject:** in one transaction it persists `component.answered`, `step.completed` and
   `message.completed { content: output or "" }`, and deletes the row.

`conversations::stop_reply` also cancels `paused` replies and deletes their row.
`send_message`'s `reply_in_progress` check counts `paused`. `recover_interrupted` only
touches `streaming`. `Runs::disconnect` fails only the runs it holds, and those are never
paused ones.

### D9. UI

- **Event store:** handles `step.started` and `step.completed` (into `message.steps`),
  `message.paused` and `message.resumed` (status), and `component.answered` (sets the
  component's `answer`).
- **`WorkflowProgress` card:** follows DESIGN.md's Workflow progress pattern. It shows a row
  of Steps: done is a black circle with a check, running is a spinner in the Mini-Me's
  solid colour, and waiting is a ring. It wraps on narrow widths. Clicking a done Trait Step
  toggles its output, pre-wrapped under the card, so a one-off view needs no new route. The
  card shows when `steps.length > 1`, or when any Step is a control Step.
- **Status label:** `paused` reads "Waiting for your approval". The Composer treats
  `paused` like `streaming`, so it shows Stop.
- **Renderer props** widen to `{ data, answer, messageId, componentId, replyStatus }`.
  Existing renderers ignore the new props. The `approval` renderer calls
  `api.answerApproval` and disables its buttons while the call is pending.

### D10. Protocol version 5 and fixtures

- `SIDECAR_PROTOCOL` and `PROTOCOL` become 5.
- `CoreFrame` loses `call.start` and `call.cancel`, and gains `run.start` and `run.cancel`.
- `SidecarFrame` loses `call.delta`, `call.progress`, `call.done`, `call.error` and
  `call.cancelled`. It gains `run.delta`, `run.progress`, `step.started`, `step.completed`,
  `run.paused`, `run.done`, `run.error` and `run.cancelled`.
- `src-tauri/fixtures/sidecar-frames.json` and `events.json` gain one of each new frame and
  event, and the round-trip tests enforce that.
- The reserved `call.input_requested` and `call.component` stay ignored.

### D11. Investigator's colour

Every family that DESIGN.md lists is taken. Investigator gets a new `oklch` family that
follows DESIGN.md's formula (tint L≈0.94 C≈0.04, solid L≈0.6–0.68, ink L≈0.42–0.48), at a
hue no other Mini-Me uses. Its ink must have at least 4.5:1 contrast on its tint. The exact
hue is chosen during implementation and shown to the user before it is committed.

## Risks / Trade-offs

- **[LangGraph checkpoint format changes in an update]** → The state carries `format: 1`,
  and the `langgraph` version is pinned in `uv.lock`. A state the sidecar cannot load fails
  the reply with `resume_failed`, which names the cause, and never crashes the run loop.
  Bumping `langgraph` then needs a check that paused runs still resume.
- **[More model calls per message]** → An Investigator reply makes about 7 to 10 calls on the
  user's key. Its description says it works in several steps. One-Step Mini-Mes are
  unchanged.
- **[A paused reply blocks its Conversation indefinitely]** → The approval stays visible and
  Stop is always offered. This was chosen over non-linear history.
- **[Parallel branches stream progress at the same time]** → `run.progress` keeps "latest
  wins", so the label may switch between branches. The card shows both branches running,
  which is the real state.
- **[New dependency footprint]** → `langgraph` 1.2.x needs `langchain-core>=1.4.7,<2`
  (1.6 is pinned), `langgraph-checkpoint`, `langgraph-sdk` and `xxhash`. All are pure Python
  or ship wheels for CPython 3.14 on Windows, macOS and Linux, and need no system
  prerequisites. The tasks verify this with `uv lock` and the Windows CI build.
- **[Prompt adapter context grows]** → Earlier outputs are capped at 50,000 characters, the
  same as history, and come after history in the prompt.

## Migration Plan

- Projects migrate to schema 3 when opened. Existing replies have no steps and no paused
  runs.
- The library's existing Workflows only gain Step IDs, so their behaviour is unchanged.
- Protocol 5 ships with both sides in one build. A development sidecar still at 4 shows
  `incompatible`.
- Rollback: an older app refuses a schema-3 Project (`schema_too_new`), as for every
  migration so far.

## Open Questions

- Investigator's exact colour (D11). It is chosen at implementation time and changes no
  spec.
