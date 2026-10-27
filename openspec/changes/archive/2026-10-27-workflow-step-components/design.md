# Design

## Context

A Trait call adds a component with the `component.add` request. The Rust core answers it in
`Runs::answer` (`runs.rs`), which already knows the call's Step: `run.calls` maps each call
ID to its `step_id`. `conversations::add_component` persists `component.added` without that
Step. The reply's started Steps are stored in `message_steps`, one row per run of a Step,
with a `position` that only grows. The UI gets them as `message.steps`, in that order.

`MessageItem.tsx` shows every component except approvals that no longer ask under the
reply's text. `WorkflowProgress.tsx` opens a done Trait Step to show its output, and
`StepsPanel` in `SidePanels.tsx` shows each Step's output in the Steps timeline.

## Goals / Non-Goals

**Goals:**
- Each component knows which run of which Step added it, durably, in the Rust core.
- After the run, the reply's own components are those of its last Trait Step run. Earlier
  Steps' components are drawn with their Step.

**Non-Goals:**
- Working out exactly which Steps' outputs make up the reply's text (condition branches,
  loops, parallel joins). The last Trait Step run is a close enough approximation (see
  Risks).
- Changing approvals, which already move to the card once answered.

## Decisions

### The Step run is a position in the reply's started Steps (Rust core)

`Component` gains `step_index: Option<u32>`, which is serialized only when present. When
the core answers `component.add`, it passes the call's `step_id` to `add_component`. Then,
under the same Project lock, it looks up the latest `message_steps` row of that reply with
that `step_id`, and stores that row's `position - 1`. While a call runs, its Step run is the
latest row with that `step_id`, because `step.completed` for that run comes only after the
call has ended. This also holds for parallel branches, which have different Step IDs.

*Why a position and not the `step_id`:* a loop runs the same Step several times, and each
run should get its own components. A position matches one entry of `message.steps`
directly, so the UI needs no extra lookup.

*Alternative:* let the sidecar send the Step with `component.add`. Rejected because the
core already knows the call's Step, and the sidecar should not be trusted with where things
are stored.

Approvals that the core adds itself keep no `step_index`. They already name their Step in
`data.step_id`.

### Storage

Migration 5 runs `ALTER TABLE components ADD COLUMN step_index INTEGER`. The
`component.added` projection writes it, and `component_columns` / `component_row` read it.
Older rows read as `NULL`, so those components stay under their reply as before. Nothing
else needs a fallback. Everything stays inside `project.sqlite`, so no new files are
written and Project-folder confinement is unchanged.

### Where the UI draws a component (UI)

A pure helper, for example `stepOfComponents(message)` next to `WorkflowProgress`, works out
which components belong to which Step run:

- `last` is the index of the last `trait` entry in `message.steps`.
- If the reply is `streaming` or `paused`, every component is the reply's own.
- Otherwise, a component is the reply's own when `step_index` is missing or equals `last`.
  The other components are grouped by `step_index`.

`MessageItem` draws only the reply's own components, after the approval filter it already
applies. `WorkflowProgress` and `StepsPanel` draw the components grouped under a Step run
below its output, with `InteractiveComponent`. A done Trait Step can be opened when it has
an output or components. Grouped components are drawn only after the reply has ended, so
while the run goes on, nothing is drawn twice.

## Risks / Trade-offs

- When a condition, loop or parallel Step ends the Workflow, the last Trait Step run is
  usually the one whose output became the reply's text. When a parallel Step ends it, only
  the last branch to start keeps its components under the reply. The other branches'
  components show in the card instead, so they can still be reached.
- A failed or stopped reply keeps the components of the Step it stopped at under its text.
  That Step can't be opened because it is not done, so this keeps its components visible.
- Components move from under the text into the card when the reply ends. This is the
  behaviour asked for, but it shifts the layout once at the end of a run.
