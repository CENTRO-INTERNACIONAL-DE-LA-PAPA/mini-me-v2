# Proposal

## Why

The glossary describes a Mini-Me's Workflow as a graph of Steps with conditions, loops,
parallel branches and human approvals, but today every Workflow has exactly one Trait Step
and a reply is a single Trait call. Real research tasks chain Traits: open up a topic, plan,
stress-test the plan, and ask the scientist before going further. The Workflow engine is the
foundation for the editors and the visual Workflow editor, so it comes first. The editors
move to the Visual Workflow editor change (#16).

## What Changes

- **Multi-Step Workflows:** a Workflow is a list of Steps. A Step is either a Trait Step or
  a control Step: an **approval**, a **condition**, a **loop** or a **parallel** split and
  join. Condition, loop and parallel Steps hold nested lists of Steps. Every Step has an `id`
  that is unique within its Workflow. The Rust core checks every Workflow when it loads the
  library.
- **Workflows run as LangGraph graphs in the sidecar:** the core starts one Mini-Me run per
  reply, sending the Workflow and the definitions of the Traits it uses. The sidecar
  compiles the Workflow into a LangGraph graph and runs each Trait Step through the existing
  Trait adapters, so the adapter interface does not change. LangGraph stays inside the
  sidecar.
- **Steps share their results:** each Trait Step still gets the user's message as its
  input. It also gets the outputs of the Trait Steps that ran before it in this run, as
  context. The prompt adapter gives these outputs to the model.
- **Conditions and loops are decided by the model:** a condition has a question and named
  branches. The AI model chosen in Settings picks one branch from that fixed list. A loop
  runs its Steps, then the model answers its question to decide whether to run them again,
  up to the loop's maximum.
- **One reply per run:** the reply shows a Workflow progress card with each Step and its
  state. The output of each finished Trait Step can be opened from the card. The reply's text
  is the Workflow's output, and it streams while the last Step on the path is running.
- **Approvals pause a run, and the pause survives a restart:** an approval Step adds an
  `approval` Interactive Component to the reply, with Approve and Reject, and the reply
  becomes `paused`. The sidecar hands its run state to the core, which saves it in
  `project.sqlite`. Approving resumes the run, even after the app was closed. Rejecting ends
  the reply with the Workflow's output so far. A paused reply blocks the Conversation, as a
  streaming reply does, and Stop ends it.
- **A new built-in Mini-Me, Investigator,** uses all four control Steps: *Scout* and
  *Wonder* in parallel, then *Plan*, a loop of *Refute* and *Plan*, then a condition. If an
  experiment can test the plan, an approval leads to *Experiment*; otherwise *Wonder* runs.
  The other thirteen Mini-Mes keep their one-Step Workflows.
- **BREAKING (link protocol 5):** the `call.*` frames between the core and the sidecar are
  replaced by Mini-Me run frames (`run.*` and `step.*`). Inside the sidecar, a Trait still
  runs as a call with its own `call_id`, which `core.request` uses.
- **New events:** `step.started`, `step.completed`, `message.paused`, `message.resumed` and
  `component.answered`. A message's status can be `paused`, and an Interactive Component
  can carry an `answer`.

## Capabilities

### New Capabilities

- `workflows`: the Step types and how a Workflow is checked, how a run executes them
  (outputs, earlier outputs as context, the model's decisions, parallel joins and loop
  limits), approvals with paused and resumed runs, the Step events, and how a run's progress
  appears in its reply.

### Modified Capabilities

- `trait-execution`: the link carries Mini-Me runs (`run.start`, `run.resume`,
  `run.cancel`, and `run.*` and `step.*` frames) instead of `call.start` and `call.*`. This
  affects concurrency, output, progress, outcomes, cancellation and `core.request`. The
  link protocol becomes version 5.
- `conversations`: replies are produced by Mini-Me runs; the `paused` status with
  `message.paused` and `message.resumed`; a paused reply blocks the Conversation, is not
  marked as interrupted on reopening, and can be stopped.
- `mini-mes`: a Mini-Me definition holds a multi-Step Workflow; the predefined Mini-Mes
  gain Investigator.
- `interactive-components`: the `approval` kind, created by the core rather than by a
  Trait, and the `component.answered` event that records an answer to a component.
- `credentials`: secrets are released per Trait call within a run, and to condition and loop
  Steps for the provider chosen in Settings.
- `ai-providers`: the prompt adapter includes the outputs of earlier Steps and tells the
  model it is one Step of a Workflow; an answer a content filter stops partway fails.
- `routing`: the `needs_context` answer is passed on through the run.

## Impact

- **Rust core:**
  - Workflow types and checks in `library.rs`, and Investigator in `builtin.json`.
  - Run management replaces Trait call management in `trait_calls.rs`.
  - New frames in `link.rs` and `protocol.rs`, the fixtures, and protocol version 5.
  - A `paused_runs` table (schema migration 3).
  - An `answer_approval` IPC command.
- **Sidecar:**
  - A Workflow runner that compiles Workflows to LangGraph, replacing the call-level
    `Runner` loop.
  - `CallContext` gains the earlier Step outputs.
  - The prompt adapter uses those outputs.
- **New dependency:** `langgraph`, pure Python and pinned with `uv`, so it works on Windows,
  macOS and Linux with no system-level prerequisites.
- **UI:** the Workflow progress card in a reply, the `paused` status, the `approval`
  renderer, and its answer command.
- **Cost:** no new external service or credential. A multi-Step run makes several model
  calls on the user's own key. An Investigator reply makes roughly 7 to 10, against 1 for a
  one-Step Mini-Me. This is normal LLM usage, so no confirmation is asked, but Investigator's
  description says it takes several steps.
- **Storage:** existing Projects are migrated when opened. A Project opened in this version
  can't be opened by older versions.

## Out of scope

- The Mini-Me and Trait editors: creating, editing, duplicating and deleting Mini-Mes and
  Traits, and offering user-made ones to routing. These move to #16, the Visual Workflow
  editor. Decisions already made for it:
  - user-made Mini-Mes and Traits are stored app-wide in Mini-Me Data;
  - built-ins can only be duplicated, not edited or deleted;
  - a user-made Trait configures only its instructions at first.
- Arbitrary graphs (jumping between Steps, joining branches of different conditions). In
  this change, Workflows are nested lists of Steps.
- Rules-based or Jev-based conditions, approvals with a comment or edits, and pausing for
  anything other than an approval Step.
- Changing a Workflow while one of its runs is paused: a paused run resumes with the
  Workflow it started with.
- Retrying a failed Step, and editing a Trait's input between Steps.
