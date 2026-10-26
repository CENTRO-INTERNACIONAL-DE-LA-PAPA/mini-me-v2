# Design

## Context

- A Workflow is a tree. `steps` is a list, a loop holds a list, and a condition or parallel
  split holds branches that each hold a list (`WorkflowStep` in `src/protocol/types.ts`). The
  Rust core checks it with `Library::problems()` on save, and the sidecar compiles it to
  LangGraph. Neither needs to change.
- `MiniMeEditor.tsx` (#15) is one scrolling page. It has a `StepList` for Trait-only
  Workflows and a `LockedWorkflow` tree for the rest, and saves the whole `MiniMeDefinition`
  with `save_mini_me`.
- `src/components/library.ts` has `nextStepId`, which makes IDs unique among a list of IDs.
- The app listens to Tauri's window drag-drop events for files (`ChatView.tsx`), so
  `dragDropEnabled` is on. On Windows (WebView2), that makes Tauri take over native drag
  events, and HTML5 drag and drop inside the page does not fire.
- The design file's Mini-Me editor screen sets the look:
  - a header with the avatar, name and description, plus the actions;
  - underline tabs: Workflow | Traits · n | Appearance;
  - a dotted canvas, with a floating vertical toolbar at its top left;
  - a 320px inspector on the right.
  DESIGN.md §8 gives the node, pill and connector styles.

## Goals / Non-Goals

**Goals:**
- Edit every kind of Step without changing the stored format or the core.
- One drag mechanism for toolbar items and existing nodes that works in all three webviews.
- Keep the tree edits and the layout as pure, tested functions, separate from rendering.

**Non-Goals:**
- Free positioning, undo and redo, keyboard-only reordering, or a minimap.
- Any change to the Workflow engine or the Rust checks.

## Decisions

### 1. Everything is in the UI; the Rust core stays the only store
The canvas edits the `MiniMeDefinition` draft in React state, and Save sends it through
`save_mini_me` as today. The core stays the source of truth and the checker, and its
problems are shown as in #15. No IPC, protocol or sidecar change.

### 2. React Flow draws; our code lays out
`@xyflow/react` 12 (MIT, pure TypeScript and DOM, no native parts) provides pan and zoom,
fit-to-view, custom node and edge components, and an edge-label layer for drop zones. It
runs in WebView2, WebKit and WebKitGTK alike, because it uses only standard DOM and SVG. We
turn off its own node dragging (`nodesDraggable={false}`), because positions come from our
layout.
*Alternatives:*
- Hand-built SVG: rejected, because pan, zoom and hit-testing would all be ours to write.
- dagre or elkjs for layout: rejected. They lay out general graphs and don't know about loop
  frames or side-by-side branches that join again, and elkjs adds about 1 MB.

### 3. Tree layout in `workflowLayout.ts`
A recursive function measures each list as a column. Nodes are 56px tall and 220px wide, and
markers are 32px pills.
- **Branches:** side by side, with a gap, under their marker, and joined below the widest
  branch.
- **Loops:** a frame around their list, with a header pill reading "Repeat up to n times:
  <question>".
- **Empty lists:** a branch or loop with no Steps gets a 40px empty slot node.
The function returns React Flow `nodes` and `edges` with absolute positions. Each edge
carries the `Slot` it represents: the list and the index where a Step dropped on it is
inserted. Connectors are step edges (orthogonal, 1.25px, `#BFBDB6`), with branch labels on
the first edge of each branch. Only the tree changes the layout, so it is recomputed
whenever the draft changes.

### 4. Steps and slots are addressed by path; edits are pure functions
`workflowEdit.ts` addresses a list by a path from the root (`[]` for the top level, then
`{ step: i, branch: j }` or `{ step: i, loop: true }` per level). A slot is `{ list, index }`.
Every function returns a new `WorkflowStep[]` and never mutates:
- `insertStep(steps, slot, step)`;
- `moveStep(steps, stepId, slot)`, which refuses a slot inside the moved Step and adjusts the
  index when moving down within the same list;
- `removeStep(steps, stepId)`, which refuses the last remaining Step;
- `updateStep(steps, stepId, change)`;
- `setAskBeforeRunning(steps, stepId, on)` and `asksBeforeRunning(steps, stepId)`;
- `newStep(kind, ids, trait?)`, which makes defaults and an ID unique across all nested
  Steps:
  - Approval: "Continue?";
  - Condition: empty question, branches "Yes" and "No";
  - Loop: empty question, limit 2;
  - Parallel: branches "Branch 1" and "Branch 2".
Selection is by Step ID, which the core keeps unique, so it survives moves.
`nextStepId` from #15 is reused with kind names ("approval", "condition"…) for control
Steps.

### 5. Drag and drop on pointer events
`useStepDrag` handles `pointerdown` on a toolbar item or a node:
1. After 4px of movement it starts a drag and captures the pointer.
2. While dragging, it draws a small ghost that follows the cursor.
3. On each move, it finds the drop target under the pointer with
   `document.elementFromPoint`, which looks for `[data-slot]` on an edge's drop zone or an
   empty slot node.
4. On `pointerup`, it calls `insertStep` or `moveStep`.
A press without movement selects the node. While a drag is on, every connector shows a
round drop target, which fills when hovered. While dragging a Step, the targets inside that
Step are hidden.
For a Trait step, a menu of Traits opens at the drop point, and nothing is inserted if it is
dismissed.
*Alternative:* turn off `dragDropEnabled` to get HTML5 drag and drop back. Rejected, because
it breaks dropping files into Conversations.

### 6. Editor structure
`MiniMeEditor` keeps loading, saving, deleting and duplicating, plus its header. Its body
becomes the `Tabs` from `@base-ui/react/tabs`, styled as in the design: 24px gaps, the active
tab with a 2px inset underline. The editor page fills the main area without page scrolling,
so the canvas can take the remaining height; App renders it without the `scrolling` wrapper.
The tabs:
- **Workflow:** `WorkflowCanvas` (React Flow plus the toolbar) and `StepInspector` (320px).
- **Traits · n:** the Traits the Trait Steps run, each once in Workflow order (worked out in
  the UI), drawn with the Library's rows. Each opens `{ kind: "trait", id }`.
- **Appearance:** the #15 fields, in a centred 760px column.
`StepList`, `LockedWorkflow` and `isListWorkflow` are removed.

### 7. Styling
The canvas uses the existing `--surface-1` (`#FAFAF8`). `index.css` gets `--canvas-dot`
(`#DEDCD5`) and `--connector` (`#BFBDB6`) as theme tokens, so no colour sits outside the
theme. React Flow's base
stylesheet (`@xyflow/react/dist/base.css`) is imported, and its defaults are overridden with
the tokens.

## Risks / Trade-offs

- **[Risk]** Pointer-based dragging over a pannable canvas could fight React Flow's panning.
  → A press on a node or toolbar item calls `stopPropagation`, and the pane pans only from
  empty canvas.
- **[Risk]** Wide parallel Workflows overflow the view. → Fit-to-view on open, plus React
  Flow's zoom controls.
- **[Risk]** Leaving the editor drops unsaved edits, as in #15. → Out of scope here; noted
  for a later change.
- **[Trade-off]** Automatic layout means users cannot arrange nodes. The stored format stays
  clean, and every Workflow looks the same everywhere.

## Migration Plan

None. The stored format is unchanged, and Workflows saved in #15 open on the canvas as they
are.
