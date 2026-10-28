# Proposal

## Why

A request such as "Create a sample CSV file and show it as a table" gets nowhere today.
Assistant, the catch-all Mini-Me that answers whenever no specialist fits, runs *Assist*,
which can only write text: it cannot save a file, show a table, or look at results from
earlier in the Conversation. Meanwhile each adapter saves files and adds Interactive
Components through its own helpers, and a Trait's abilities are split between its
definition (`components`) and its adapter's code. This change makes tools the one way a
Trait reads, saves and shows, and lets prompt-based Traits use them. It addresses #3 and
#24.

## What Changes

- **Tools are a new sidecar concept, separate from adapters.** An adapter is what a Trait
  always does; a tool is one action, such as saving a file or showing a table, that an
  adapter's code takes or that the adapter offers its AI model. The tools live in a shared
  `tools/` package: save a file, read a file, read a table, read a component, and one show
  tool per Interactive Component kind (show a table, show a chart, show papers, show
  theories).
- **Trait definitions list their tools.** `tools` replaces `components` on every Trait, so a
  Trait's abilities are listed in one place, the place a future Trait editor will show.
  Interactive Components themselves (kinds, renderers, events, storage) do not change; the
  show tools are how a Trait adds one. The core no longer checks a component's kind against
  the Trait; it still refuses `approval` from Traits and checks every component's text and
  size. **BREAKING** for the interactive-components requirement "Only listed kinds are
  accepted".
- **Prompt-based Traits use tools.** The `prompt` adapter tells the model the name and ID of
  every file and Interactive Component in the Conversation, offers it read-a-file and
  read-a-component, plus the tools its Trait lists, and runs a loop: the model may call
  tools, see their results and continue, until it writes its answer or reaches a limit on
  tool rounds. Referenced files are no longer put into the prompt up front; the model reads
  them when it needs them.
- *Assist* lists save-a-file and show-a-table, so Assistant can create files and tables and
  answer about earlier results. Assistant's description names files and tables.
- **Every adapter acts through the tools.** The data Traits read their tables, save their
  files and show their tables and charts through them; *Find Papers* and *Theorize* show
  their components and save the Theory Store through them. Their replies do not change.
- `openspec/config.yaml`, README and `docs/architecture.md` define Adapter and Tool.

## Out of scope

- Calling other Traits or handing a request to another Mini-Me as a tool (#5).
- Code execution (Python/R) by Traits; generated data is written by the model directly.
- Mini-Me and Trait editors; tools for models beyond save-a-file and show-a-table (charts,
  papers and theories are shown only by their fixed adapters).
- Binary files (such as Excel) written by a model; it saves text files only.
- Reading PDFs, Word files and other formats other than text and tables.
- Data Traits using the latest table of the Conversation when none is referenced (#4).

## Capabilities

### New Capabilities
- `tools`: what a tool is, each tool with its limits and failures, the narrower forms
  offered to a model, and that adapters act through them.
- `tool-use`: how prompt-based Traits use tools: what they know of the Conversation's files
  and components, which tools their model is offered, the tool rounds and their limit,
  failures returned to the model, and models without tool calling.

### Modified Capabilities
- `mini-mes`: Trait definitions have `tools` instead of `components`; Assistant's
  description includes files and tables.
- `interactive-components`: component data comes from show tools; the core refuses only
  `approval` from Traits instead of checking a listed kind.
- `trait-execution`: each Trait in `run.start` carries its `tools`.
- `conversation-context`: a file's content reaches a model only through read-a-file.

## Impact

- **Rust core:**
  - `library.rs` and `library/builtin.json`: `tools` instead of `components`, the known tool
    names and the load checks, *Assist*'s instructions and Assistant's description;
  - `components.rs` and `runs.rs`: the check refuses only `approval` from Traits;
  - `link.rs`: `tools` in each `run.start` Trait. Link protocol stays at 6, which no
    release has shipped yet.
- **Sidecar:**
  - new `tools/` package, reusing the table helpers in `adapters/data/` (`parse_table`,
    `table_data`, `table_text`);
  - `adapters/prompt.py` gains the Conversation listing and the tool loop;
  - `adapters/data/replies.py` (`_save`, `_table`, Plot's charts, `read_tables`) and
    `adapters/asta.py` (`_component_or_text`, the Theory Store) move onto the tools.
- **UI:** no change.
- **Cost and services:** no new external service or credential. Tool rounds are extra
  requests to the user's own AI provider: a reply that reads a file takes one more short
  request than before, and the limit on tool rounds bounds the rest. Prompt-based Traits
  now need a model with tool calling, as the data Traits already do; a model without it
  fails with a message saying to choose another.
- **Dependencies:** none new; LangChain's `bind_tools` is already in the installed provider
  packages.
