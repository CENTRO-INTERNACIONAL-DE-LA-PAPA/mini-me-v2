# Proposal

## Why

A Mini-Me can only do what its Traits list, so a request outside those lists fails or needs a
hand-off, and every Trait needs its tools configured. Offering every tool to every Mini-Me makes
Mini-Mes simpler to build and harder to get wrong. This is change 2 of 4 of
`docs/plan-components-tools-routing.md`.

## What Changes

- **Traits no longer list tools.** **BREAKING** for the Trait definition: the `tools` field is
  removed from the library, `library.json`, `run.start`'s `traits` and the Trait editor. Every
  prompt-based Trait's model is offered every tool that has a form for models. Fixed adapters
  (data, Asta, Dataverse) keep calling the tools their code needs, declared in their code.
- The Trait editor loses its Tools checklist, a Workflow node shows only its Trait's name, and
  the Step inspector no longer lists a Trait's tools.
- Suggest-an-edit stays offered only in a comment thread and edit-a-document only outside one,
  until change 3 replaces both with one suggestion tool.
- Link protocol 17.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mini-mes`: a Trait definition has no `tools`.
- `library-editors`: the Trait editor has no tool checklist; saves no longer check tools.
- `workflow-editor`: Trait nodes and the inspector no longer show tools.
- `trait-execution`: `run.start`'s `traits` entries have no `tools`; link protocol 17.
- `tool-use`: every prompt-based Trait's model is offered every model tool.
- `tools`: fixed adapters declare the tools their code uses.

## Out of scope

- The suggestion tool, comments and threads (change 3).
- Jev's tool, component and hand-off hints, and the hand-off changes (change 4).

## Credentials, services and cost

None.

## Impact

- Rust core: `library.rs`, `user_library.rs`, `link.rs`, `runs.rs`, `ipc.rs`, `builtin.json`.
- Sidecar: `tools/__init__.py`, `adapters/prompt.py`, `context.py`, `link.py`, tests.
- UI: `TraitEditor.tsx`, `workflow/tools.ts`, `WorkflowCanvas.tsx`, `StepInspector.tsx`,
  `types.ts`.
- No new dependencies.
