# Tasks

## 1. Core

- [x] 1.1 Remove `tools` from `TraitDef`, `TraitSummary`, `TraitDraft` and `RunTrait`, the tool
  rules in `problems()`, and `TOOLS` and `MODEL_TOOLS` in `library.rs`. Drop every `tools` list
  from `builtin.json`. Update the library and user-library tests that list or check tools, and
  the skipped-entry test to use empty instructions. Verify: `cd src-tauri && cargo test` passes.
- [x] 1.2 Set `SIDECAR_PROTOCOL` to 17. Verify: `cd src-tauri && cargo test` passes and
  `cargo clippy` adds no warning.

## 2. Sidecar

- [x] 2.1 Remove `TraitDefinition.tools` and make `_offered` return every model tool, keeping
  only the thread rule for `suggest_edit` and `edit_document`. Set `PROTOCOL` to 17. Update
  `test_prompt_turns.py`'s `_offered` test. Verify: `cd sidecar && uv run pytest` passes.
- [x] 2.2 Rewrite `test_tool_lists.py` to check that fixed adapters' `uses_tools` are known
  tools. Verify: `cd sidecar && uv run pytest tests/test_tool_lists.py` passes.

## 3. UI

- [x] 3.1 Remove `tools` from `TraitSummary` and `TraitDraft` in `types.ts`, the Tools field
  from `TraitEditor.tsx`, the node's meta line from `WorkflowCanvas.tsx`, the tools row from
  `StepInspector.tsx`, and `workflow/tools.ts`. Verify: `npx tsc --noEmit` is clean and
  `npm test` passes.
- [x] 3.2 In the app: open a built-in Mini-Me's Workflow and a user-made Trait, and check that no
  tools show; ask Explorer (*Scout*) to save a short note as a file, and check it can. Verify:
  the user's run confirms it.

## 4. Docs

- [x] 4.1 Update `docs/architecture.md` where it describes Trait tool lists, and add the
  change's line to `CHANGELOG.md` under "Improved". Verify: `grep -n "tools its Trait" docs/`
  finds nothing outdated.

## Workflow follow-up

- Archive the change (`/opsx:archive`), commit in batches, push to PR #186, then propose
  change 3 (suggestions and comments).
