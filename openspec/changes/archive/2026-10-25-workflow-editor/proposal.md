# Proposal

## Why

A user-made Mini-Me's Workflow can only be edited as a list of Trait Steps. Approvals,
conditions, loops and parallel branches, which the Workflow engine has run since Roadmap #11,
can't be added by users. A duplicated Investigator shows its Workflow locked. The visual
Workflow editor from the design file closes that gap: users see a Workflow as a graph and
build any Workflow the engine can run.

## What Changes

- **Tabs:** the Mini-Me editor gets three tabs, as in the design file:
  - **Workflow:** the canvas.
  - **Traits · n:** the Traits its Workflow runs, each opening its Trait editor.
  - **Appearance:** name, description, group, avatar and colour, moved from the single page
    built in #15.
- **Canvas:** the Workflow tab draws the Workflow as a graph:
  - a "When invoked" start and a "Reply in conversation" end;
  - a node for each Trait Step and approval;
  - a marker for each condition and parallel split, with its branches side by side;
  - a frame for each loop.
  Nodes are placed automatically from the Workflow's Steps, so no positions are stored.
- **Drag and drop:** a toolbar on the canvas offers Trait step, Approval, Condition, Loop and
  Parallel. Dragging one onto a connector inserts it there. Dragging a node onto another
  connector moves it, together with any Steps inside it.
- **Inspector:** a 320px panel beside the canvas edits the selected Step.
  - A Trait Step picks its Trait. The inspector shows the Trait's description and tools in
    plain words, how many Mini-Mes use it, and a link to edit it. Its "Ask before running"
    toggle adds or removes an approval right before the Step.
  - A control Step edits its prompt or question, the loop limit, and its branches (rename,
    add, remove).
  - Every Step can be removed.
- **Replaced:** the list editor and the locked view from #15. Built-in Mini-Mes show their
  Workflow on the canvas, read-only.
- **Saving:** unchanged. The whole Mini-Me is saved, and the core checks it with the
  existing Workflow rules.

## Capabilities

### New Capabilities
- `workflow-editor`: the canvas, the Step toolbar, drag and drop, the inspector and their
  rules for building a Mini-Me's Workflow.

### Modified Capabilities
- `library-editors`:
  - The Mini-Me editor is split into the Workflow, Traits and Appearance tabs.
  - The requirements for the list Workflow and the locked Workflow are removed, because the
    canvas replaces both.

## Out of scope

- Retrying a failed Step, and choosing which earlier output a Step reads. Both would need
  new Step fields and Workflow engine changes.
- A test run from the editor.
- A per-Trait model choice. Node meta lines show tools only.
- Saving node positions or arranging nodes freely.
- Undo and redo on the canvas, and a warning before leaving unsaved edits.

## New services, credentials or costs

None. Editing makes no model calls.

## Impact

- **UI:**
  - `MiniMeEditor.tsx` is reorganised into tabs.
  - New canvas, toolbar and inspector components.
  - A pure module of Workflow tree edits (insert, move, remove, approval toggle, IDs) and the
    automatic layout, with frontend tests.
- **New dependency:** `@xyflow/react` (React Flow 12, MIT) draws the canvas.
- **Rust core and sidecar:** no change. The Workflow format, checks and runner stay as they
  are.
