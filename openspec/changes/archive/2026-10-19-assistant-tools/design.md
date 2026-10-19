# Design

## Context

See proposal.md for the motivation. Today:

- Assistant answers whenever routing has no confident choice. *Assist* and the other
  prompt-based Traits (*Summarize*, *Scout*, *Refute*, *Plan*, *Wonder*, *Experiment*) run on
  the `prompt` adapter (`sidecar/src/mini_me_sidecar/adapters/prompt.py`), which puts the
  message's referenced text files into the prompt and streams one model answer, with no
  tools.
- A Trait call reaches the core only through `CallContext` (`context.py`): `write`,
  `progress`, `read_asset`, `history`, `results`, `read_component`, `component`,
  `write_asset` and `secret`. The core answers these in `Runs::answer`
  (`src-tauri/src/runs.rs`), where `component.add` is checked against the Trait's
  `components` (`components.rs`).
- The data adapters read tables with `read_tables` (`adapters/data/tables.py`) and save and
  show through `_save` and `_table` (`adapters/data/replies.py`); Plot adds charts with
  `ctx.component`. The Asta adapters add `paper-sources` and `theories` through
  `_component_or_text` and save the Theory Store with `ctx.write_asset` (`adapters/asta.py`).

## Goals / Non-Goals

**Goals:**
- One implementation per action, used both by adapter code and by models.
- A Trait's abilities listed in one place: its `tools`.
- Every effect of a tool goes through an existing core request; durable state stays in the
  core.
- No change users can see in the data and Asta Traits.

**Non-Goals:**
- Model forms of show-a-chart, show-papers and show-theories.
- Parallel execution of tool calls within a round; they run in the order the model gave.

## Decisions

### 1. Adapters, tools and `ctx`
There are three layers in the sidecar, each with one job:

| | Adapter | Tool | `ctx` (`CallContext`) |
|---|---|---|---|
| Is | The engine that runs a Trait; what the Trait always does | One action, such as saving a file or showing a table | What the core lets a running call do |
| Decided by | Its own code | Whoever calls it: adapter code, or a model the adapter offers it to | — |
| Lives in | `adapters/` | `tools/` | `context.py` |

An adapter reads, saves and shows only through tools: no adapter calls `ctx.read_asset`,
`ctx.component` or `ctx.write_asset` directly. Interactive Components keep their catalogue,
renderers, events and storage; the show tools are how a Trait adds one.

### 2. Trait definitions list their tools
`TraitDef.components` becomes `TraitDef.tools`, a list of tool names, and the same list
goes to the sidecar in each `run.start` Trait (`RunTrait.tools`).
- **Fixed adapters** (data, Asta) list the tools their code uses. Each such adapter class
  declares the same names (`Adapter.uses_tools`), and a pytest test reads
  `src-tauri/library/builtin.json` and checks every fixed-adapter Trait lists exactly its
  adapter's tools.
- **Prompt-based Traits** list the tools their model is offered besides read-a-file and
  read-a-component, which every prompt-based Trait gets. Only tools with a model form
  (`save_file`, `show_table`) may be listed.
- `library.rs` holds the known tool names (`TOOLS`) and the model ones (`MODEL_TOOLS`);
  `Library::problems` reports an unknown name or a prompt-based Trait listing a
  non-model tool, as it reports bad Workflows. A pytest test checks `tools/__init__.py`
  knows the same names.
- The core drops its per-Trait kind check: `components::check` keeps refusing `approval`
  from Traits (`component_not_allowed`), empty text and data over 2 MiB
  (`invalid_component`). A wrong kind from a buggy adapter still shows safely: the UI
  renders an unknown kind as its text.
- `tools` has `#[serde(default)]`, so runs paused before this change resume (their saved
  Traits have `components`, which is ignored, and no `tools`).

*Alternative:* keep `components` next to the tools. Rejected: every ability would be
added twice. *Alternative:* let the adapter decide the tools. Rejected: one `prompt`
adapter runs many Traits, so only the definition can say which Trait gets which tools.

### 3. Tool use in the `prompt` adapter
`adapters/prompt.py` builds LangChain messages (`AIMessage(tool_calls=…)` and `ToolMessage`
need them):
- the system prompt: the reply rule, the Workflow rule inside a multi-Step Workflow, a rule
  on files ("the Conversation's files and components are listed below; read one with
  read_file or read_component before relying on it"), then the Trait's instructions;
- earlier turns, as now;
- earlier Step outputs, as now;
- the message text, followed by the Conversation's results from `ctx.results()`: files
  (name, ID, marked when they belong to the message) and components (kind, author, ID),
  newest first, at most 50 of each.

Each round streams `chat.bind_tools(offered).astream(messages)`, writes text chunks with
`ctx.write` and adds the chunks together to get the round's `tool_calls`. With none, the
call is done; otherwise each call runs in order and its result (short JSON) is appended as
a `ToolMessage`. After 8 rounds with tool calls, one last `astream` without tools ends the
call. Turn merging for Anthropic and Google applies to consecutive human turns only. The
empty-answer retry and the content-filter handling stay as they are.

The adapter imports `tools` when it runs, not at the top: the tools load pandas through the
table helpers, and the sidecar must start without it.

*Alternative:* LangGraph's prebuilt ReAct agent. Rejected: it hides streaming and
cancellation, which the adapter controls per round.

### 4. The tools package
`sidecar/src/mini_me_sidecar/tools/`:
- `base.py`: `ToolError(message, code=None)`; a refused core request keeps the core's code.
- `files.py`: `save_file(ctx, name, media_type, data)` (up to 32 MiB) and
  `save_text_file(ctx, name, content)`, the model form (text extensions, 2 MiB); `read_file(
  ctx, asset_id, start=0)`: tables as columns plus up to 500 rows as CSV from row `start`,
  other UTF-8 text as up to 100,000 characters from character `start`, each with the total.
- `tables.py`: `read_table(ctx, asset_id, name, text)` (100 MiB limit, `table_too_large`,
  `table_unreadable`), `show_frame(ctx, frame, title, source)` for adapter code and
  `show_table(ctx, title, columns, rows, asset_id)`, the model form.
- `components.py`: `show_chart`, `show_papers`, `show_theories` and `read_component(ctx,
  component_id)`; the show tools and `show_table`/`show_frame` add their kind through one
  private helper around `ctx.component`.
- `__init__.py`: the tool names, and each model tool's name, description, JSON Schema and
  function.

Validation is pure functions (`check_file`, `check_table`) and so is result shaping; those
are what the pytest tests cover. Tables reuse `parse_table`, `table_data` and `table_text`,
so a table from Assistant and one from a data Trait are typed and previewed by the same
code. Read tools look an ID up in `ctx.results()`, so they only reach the call's
Conversation.

### 5. Moving the data and Asta adapters onto the tools
- `adapters/data/replies.py`: `_table` becomes `show_frame`; `_save` keeps building the
  file with `table_file` and saves it with `save_file`; Validate's HTML report goes through
  `save_file`; Plot's charts go through `show_chart`, keeping its text fallback.
- `read_tables` moves from `adapters/data/tables.py` into `replies.py`, its only caller, and
  reads each table with `read_table`. `tables.py` then imports nothing from `tools`, so
  `tools/tables.py` can import `parse_table` without a cycle.
- `adapters/asta.py`: Find Papers shows with `show_papers` and Theorize with
  `show_theories`; `_component_or_text` keeps writing the text when the tool fails with a
  refused-component code; the Theory Store is saved with `save_file`.

### 6. Error for models without tools
A provider error whose message mentions tools or function calling (for example,
OpenRouter's "No endpoints found that support tool use") becomes `TraitError(
"tools_unsupported", …)`, naming the model and saying to choose another in Settings. Other
errors still go through `provider_error`.

### 7. Instructions
The prompt Traits' instructions in `builtin.json` that speak of "files that follow the
message" say instead to read the listed files they need. *Assist*'s instructions add when to
save a file, when to show a table, and never to claim a file or table exists unless its
tool succeeded.

## Risks / Trade-offs

- [A reply that needs a file takes one more request] → It is short (the model only asks
  for the file); the file's content is sent once either way, and replies that need no file
  are unchanged.
- [Prompt-based Traits now need tool calling] → The data Traits already need it; the
  `tools_unsupported` error names the model.
- [Multi-Step Workflows (Investigator) may read files in several Steps] → Each Step reads
  only what it needs; the round limit bounds each call.
- [Moving seven Traits onto the tools can change their replies by accident] → The move
  keeps each reply's text, file names and error messages; pytest covers the computations,
  and the in-app pass covers each Trait.
- [Model-written rows can have wrong types] → `check_table` rejects values that do not
  match their column type and names the row, so the model can fix them.

## Migration Plan

- No event or database change. Link protocol stays at 6 (unreleased); `run.start` Traits
  gain `tools`.
- Paused runs resume: saved Traits without `tools` default to none.
- `openspec/config.yaml` (glossary: Adapter, Tool), README (a **Tool** row in Concepts) and
  `docs/architecture.md` (the table and rule from decision 1 replace its "Tools" section;
  the Trait example, the data adapters' paragraph and the `ctx` table follow the change).
- The Roadmap (`docs/roadmap.md`) is not changed.
