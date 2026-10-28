# Proposal

## Why

When a Trait Step adds an Interactive Component, the component is attached to the whole
reply, so it stays under the reply's text after the Workflow ends, even when an earlier Step
added it. For example, a *Find Papers* Step early in a Workflow leaves its paper sources
under a reply whose text was written by a later Step. Earlier Steps' text already stays out
of the reply's text and shows in the Workflow progress card; their components should behave
the same way.

## What Changes

- The Rust core records, on each component a Trait call adds, which run of which Step added
  it: its position in the reply's started Steps.
- `component.added` carries that position as `component.step_index` (a number, or absent
  for components added outside a Step).
- While the run goes on, every component shows under the reply, as today.
- Once the reply ends, the reply shows only the components of the last Trait Step run in
  its started Steps, and those with no Step. Components of earlier Steps show when that
  Step is opened in the Workflow progress card, and under that Step in the Steps timeline,
  below its output.
- Approvals keep their current behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interactive-components`: the `component.added` payload gains `step_index`; where a
  reply's components show once its Workflow run has ended.
- `workflows`: the Workflow progress card shows an opened Step's components with its
  output.

## Out of scope

- Moving components between Steps after the run, or letting the user pin an earlier Step's
  component under the reply.
- When a parallel Step ends the Workflow, only the components of the last Trait Step run
  to start stay under the reply. The other branches' components show in the card.
- Featuring on the Overview and `$` references: they keep working for every component,
  wherever it is drawn.
- No new external service, credential or cost.

## Impact

- Rust core: `protocol.rs` (`Component`), `db.rs` (migration 5: `components.step_index`),
  `store.rs` (projection and reads), `conversations.rs` (`add_component`), `runs.rs`
  (passes the call's Step).
- UI: `protocol/types.ts`, `MessageItem.tsx`, `WorkflowProgress.tsx`, `SidePanels.tsx`
  (Steps timeline).
- Existing components in stored Projects get no `step_index`, so they stay under their
  reply as before.
