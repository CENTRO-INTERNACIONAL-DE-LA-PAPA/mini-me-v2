# Tasks

## 1. Workflow tree edits and layout

- [x] 1.1 Add `src/components/workflow/workflowEdit.ts` with paths and slots, `newStep`, `insertStep`, `moveStep` (refusing a slot inside the moved Step), `removeStep` (refusing the last Step), `updateStep`, `asksBeforeRunning` and `setAskBeforeRunning`, all returning new arrays. Verify: `workflowEdit.test.ts` passes, covering:
  - inserting into a branch;
  - moving down within one list and into a branch;
  - refusing to drop a loop inside itself;
  - removing a loop with its Steps;
  - refusing to remove the last Step;
  - the approval toggle ("Run Refute?" added, then removed);
  - IDs unique across nested Steps.
- [x] 1.2 Add `src/components/workflow/workflowLayout.ts`, which turns a Workflow into React Flow nodes and edges with positions. It places start and end pills, Trait and approval nodes, markers with branches side by side and joined below, loop frames and empty slots, and gives each edge its `Slot` and each branch's first edge its label. Verify: `workflowLayout.test.ts` passes. On Investigator it checks that "Directions" and "Questions" sit side by side at one height and that *Plan* sits below both. It also checks that every slot is reachable once and that an empty branch gets a slot node.

## 2. Canvas

- [x] 2.1 Add `@xyflow/react`, the `--canvas-dot` and `--connector` tokens (the canvas uses `--surface-1`) in `src/index.css`, and the React Flow base stylesheet. Verify: `npm install` succeeds, and `npx tsc --noEmit` and `npm run build` pass.
- [x] 2.2 Add `WorkflowCanvas` with custom nodes (Trait and approval nodes, start and end pills with the Mini-Me's avatar, marker pills, loop frames, empty slots) and an orthogonal edge with a branch label and a drop zone. Style them as in DESIGN.md §8 and the design file, read-only first: pan, zoom, fit to view, and click to select. Verify: `npx tsc --noEmit` passes. The user opens Investigator's Workflow tab in the app and it matches the spec's scenario.
- [x] 2.3 Add the pointer-based `useStepDrag`, the floating toolbar (Trait step, Approval, Condition, Loop, Parallel), the drop zones shown while dragging, the Trait menu for a dropped Trait step, and moving nodes. Hide the toolbar and dragging for built-in Mini-Mes. Verify: `npx tsc --noEmit` passes. The user, in the app on macOS, inserts each Step type, moves *Plan* into a branch, and checks that a loop can't be dropped inside itself and that Skeptic's canvas can't be changed.

## 3. Inspector and editor tabs

- [x] 3.1 Add `StepInspector`.
  - Trait Step: Trait picker, description, tools in plain words, used-by count, "Edit Trait" link and the "Ask before running" toggle.
  - Control Steps: prompt or question, loop limit (1–10), branch labels, and adding or removing branches (at least two).
  - Every Step: Remove step.
  - Built-in Mini-Mes: read-only.
  Verify: `npx tsc --noEmit` passes. The user in the app changes a Step's Trait, turns "Ask before running" on and off, renames and adds branches, and removes a loop.
- [x] 3.2 Split `MiniMeEditor` into the Workflow, Traits · n and Appearance tabs, styled as in the design, and let the editor fill the main area without the page-scroll wrapper. Remove `StepList`, `LockedWorkflow` and `isListWorkflow`, and its test. Verify: `npm test` and `npx tsc --noEmit` pass. The user in the app checks that Investigator's Traits tab reads "Traits · 5", that Appearance edits still save, and that saving a condition with an empty branch shows the core's problem with the canvas unchanged.

## 4. End to end

- [x] 4.1 Check the whole flow in the app on macOS. Build a user-made Mini-Me with a parallel split, an approval and a loop, save it, and mention it in a Conversation. The run's progress card should list its Steps, and the approval should pause the run. Verify: the user confirms. The Windows drag check follows on the next release build.

## Workflow follow-up

- Archive with `/opsx:archive`, syncing the delta specs into `openspec/specs/`.
- Mark Roadmap #16 "Done" and #17 "Next" in `docs/roadmap.md`.
- Ask before opening the PR from `feat/workflow-editor` into `dev`.
