# Design

## Context

See proposal.md for the motivation; the requirements are in the delta specs. The full picture
of the four changes is in `docs/plan-components-tools-routing.md`.

- `TraitDef.tools` (`library.rs`) is checked in `problems()` against `TOOLS` and `MODEL_TOOLS`.
  It is copied into `TraitSummary`, `TraitDraft` (`user_library.rs`) and `RunTrait` (`link.rs`),
  and sent in `run.start`.
- The sidecar offers `DEFAULT_TOOLS` plus the Trait's list (`prompt.py` `_offered`). It leaves
  out `THREAD_TOOLS` outside a comment thread and `CONVERSATION_TOOLS` inside one.
- `test_tool_lists.py` checks that fixed adapters' `uses_tools` match the lists in
  `builtin.json`.
- The UI shows the lists in `TraitEditor.tsx` (a checklist), `WorkflowCanvas.tsx` ("N tools",
  through `workflow/tools.ts`) and `StepInspector.tsx`.

## Goals / Non-Goals

**Goals:**
- One list of model tools, offered the same way on every call, whatever the Trait.

**Non-Goals:**
- Changing the edit tools, which change 3 replaces with one suggestion tool.
- Narrowing the offered tools, which is Jev's hint in change 4.

## Decisions

These were settled with the user while planning the change.

### The `tools` field is removed everywhere (all three processes)
- `TraitDef`, `TraitSummary`, `TraitDraft` and `RunTrait` lose `tools`, and `builtin.json`
  drops every `tools` list. A `library.json` that still holds `tools` keeps loading, because
  serde ignores unknown fields.
- `problems()` loses its tool rules, and `TOOLS` and `MODEL_TOOLS` in `library.rs` go, since
  nothing in the core reads tool names anymore.
- In the sidecar, `TraitDefinition.tools` goes. `_offered` returns every model tool except the
  thread rule: `suggest_edit` only in a thread, `edit_document` only outside one.
- Fixed adapters keep `uses_tools`, which documents what their code calls.
  `test_tool_lists.py` checks those names are known tools.

### The UI shows no tools
- The Trait editor's Tools field goes.
- A Trait Step's node shows only its Trait's name.
- The Step inspector shows the Trait's description without a tools line.
- `workflow/tools.ts` (`toolLabel`, `toolCount`) is deleted once nothing uses it.

## Risks / Trade-offs

- [Every model is offered up to 7 tools on every call] → this is the intended trade. Change 4
  adds Jev's hint for the likely useful ones.
- [Breaking link change] → `traits` entries lose `tools`, and the link protocol goes from 16
  to 17.

## Migration Plan

No database change. `library.json` files that still list `tools` keep loading, and the field is
dropped on their next save.
