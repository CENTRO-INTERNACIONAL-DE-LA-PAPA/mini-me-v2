# Tasks

## 1. The tools package

- [x] 1.1 Create `sidecar/src/mini_me_sidecar/tools/` with `base.py` (`ToolError`, keeping a
  refused core request's code) and the pure checks `check_file` (plain name, text
  extension, 2 MiB, media type) and `check_table` (column types, at most 500 rows, row
  lengths, values matching their column type), with pytest tests in
  `sidecar/tests/test_tools.py`; verify with `cd sidecar && uv run pytest`
- [x] 1.2 Add `tools/files.py`: `save_file` (up to 32 MiB), `save_text_file` (model form)
  and `read_file` (tables as CSV of up to 500 rows from a start row, text as up to 100,000
  characters from a start character, each with the total; unreadable otherwise), with
  pytest tests for the result shaping and paging; verify with `uv run pytest`
- [x] 1.3 Add `tools/tables.py` (`read_table`, `show_frame`, `show_table` from given rows or
  an Asset) and `tools/components.py` (`show_chart`, `show_papers`, `show_theories`,
  `read_component`, one private helper around `ctx.component`), with pytest tests for
  building table data from given rows and shaping a read component; verify with
  `uv run pytest`
- [x] 1.4 Add the tool names and the model tools (`read_file`, `read_component`,
  `save_file`, `show_table`: name, description, JSON Schema, function) in
  `tools/__init__.py`, with a pytest test that every schema is valid and matches its
  function's arguments; verify with `uv run pytest`

## 2. Trait definitions list their tools

- [x] 2.1 Replace `components` with `tools` (`#[serde(default)]`) on `TraitDef` and in
  `library/builtin.json` (lists as in the mini-mes delta); add `TOOLS` and `MODEL_TOOLS` to
  `library.rs` and report unknown names and non-model tools on prompt-based Traits in
  `Library::problems`; update the library tests; verify with `cd src-tauri && cargo test`
- [x] 2.2 Add `tools` to `RunTrait` in `link.rs` and to `TraitDefinition` in the sidecar's
  `context.py`; drop the allowed kinds from `CallKind::Trait` and `components::check`, which
  refuses only `approval` from Traits and keeps the text and size checks; update the Rust
  tests (any kind accepted from a Trait call, `approval` refused, `run.start` carries
  `tools`); verify with `cargo test`
- [x] 2.3 Add a pytest test that reads `src-tauri/library/builtin.json` and checks that
  every tool name is known to `tools/__init__.py`; verify with `uv run pytest`

## 3. Adapters act through the tools

- [x] 3.1 Move `read_tables` from `adapters/data/tables.py` into `adapters/data/replies.py`
  and read each table with `read_table`; replace `_table` with `show_frame`, save through
  `save_file` in `_save` and for Validate's HTML report, and show Plot's charts with
  `show_chart`, keeping its text fallback; declare each data adapter's `uses_tools`; verify
  with `uv run pytest` (`test_tables.py` and the data tests still pass)
- [x] 3.2 In `adapters/asta.py`, show with `show_papers` and `show_theories`, keep
  `_component_or_text`'s text fallback on a refused component, save the Theory Store with
  `save_file`, and declare `uses_tools`; verify with `uv run pytest`
- [x] 3.3 Add a pytest test that every fixed-adapter Trait in `builtin.json` lists exactly
  its adapter's `uses_tools`; verify with `uv run pytest`, and that
  `grep -rn "ctx.component\|ctx.write_asset\|ctx.read_asset" sidecar/src/mini_me_sidecar/adapters`
  finds only the test-only adapters in `testing.py`

## 4. Tool use in the prompt adapter

- [x] 4.1 In `adapters/prompt.py`, list the Conversation's results (from `ctx.results()`)
  after the message instead of putting referenced files' content in the prompt, and add the
  files rule to the system prompt; update `test_prompt_turns.py` for the listing; verify
  with `uv run pytest`
- [x] 4.2 Add the tool loop to the `prompt` adapter: LangChain messages, the read tools
  plus the Trait's listed model tools, `bind_tools` rounds that stream text, tool calls run
  in order, `ToolError` returned as the call's result, cancellation checked before each
  round and tool, a last round without tools after 8 tool rounds, `tools` imported when the
  adapter runs; verify that Scribe, Explorer and Assistant answer in the app
- [x] 4.3 Map provider errors about tool or function calling to `tools_unsupported`
  naming the model, with a pytest test of the error matching; verify with `uv run pytest`
- [x] 4.4 Update the prompt Traits' instructions in `builtin.json` that mention files
  following the message, write *Assist*'s instructions for its tools (Design §7), and set
  Assistant's description to "Answers general questions and requests that no other Mini-Me
  specializes in, and can save files and show tables"; verify with `cargo test`

## 5. Documentation

- [x] 5.1 Define Adapter and Tool: **Adapter** and **Tool** in the `config.yaml` glossary,
  a **Tool** row in the README's Concepts table, and the table and rule from Design §1 in
  `docs/architecture.md`, replacing its "Tools" section; update the architecture doc's
  Trait example (`tools` instead of `components`), the data adapters' paragraph, the
  `prompt` adapter's description and the `ctx` table; verify by reading the three places
  side by side and that `grep -rn "\"components\"" docs README.md` finds no Trait field

## 6. In the app

- [x] 6.1 Without a mention, send "Create a sample CSV of potato yields by variety and show
  it as a table": Assistant answers with a CSV attached and a `table` component; then
  "what is in the third row of the last table?" answers from the table; and
  "@Scribe summarize #notes.txt" reads the file and summarizes it; verify by the user's run
  of `npm run tauri:dev`
- [x] 6.2 Check that every Trait replies as before: Profiler, Validator (with its HTML
  report), Curator (cleaned file and tables), Linker, Plotter (charts), Researcher (paper
  list), Theorist (theories and `theory-store.json`), Explorer, Skeptic and an Investigator
  run with an approval; verify by the user's run of `npm run tauri:dev`

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its delta specs into `openspec/specs/`.
- Do not touch the Roadmap (`docs/roadmap.md`).
- Ask before committing, pushing and opening the pull request from `feat/assistant-tools`
  into `dev`; it closes #3 and #24.
