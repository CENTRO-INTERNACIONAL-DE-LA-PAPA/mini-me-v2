# Proposal

## Why

Once an approval is answered, its Interactive Component stays below the reply's text, showing
"Approved" or "Rejected" (issue #27). After the Workflow continues, it sits under the final
answer and looks out of place. A reply stopped before an answer still shows the prompt, with
nothing to press. The answer belongs with the approval Step in the Workflow progress card,
where conditions and loops already show their outcome.

## What Changes

- The reply shows an `approval` component only while it asks: unanswered, with the reply
  `paused`. An answered approval, or one whose reply was stopped first, is not shown below the
  reply.
- The Workflow progress card shows an answered approval Step's answer next to its name, as it
  does a condition's or loop's outcome: "Go on? · approved" or "· rejected". The answer is
  read from the approval component of that Step run, so it also shows for Conversations
  answered before this change and after reopening.
- The component and its answer stay stored and replayed as before. Conversation history and
  the event protocol are unchanged.

Out of scope:
- How approvals pause and resume a run.
- How other component kinds are shown.
- Showing the whole Workflow plan in the progress card (#19).

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interactive-components`: the "Approval component" requirement says when the component is
  shown, instead of what it shows once answered.
- `workflows`: "Workflow progress in the reply" shows a decision Step's outcome and an
  answered approval Step's answer.

## Impact

- UI: `src/components/MessageItem.tsx` (which components show),
  `src/components/WorkflowProgress.tsx` (the approval Step's answer),
  `src/components/interactive/approval.tsx` (only the asking state remains).
- Specs: `openspec/specs/interactive-components/spec.md`, `openspec/specs/workflows/spec.md`.
- No Rust core or sidecar change.
