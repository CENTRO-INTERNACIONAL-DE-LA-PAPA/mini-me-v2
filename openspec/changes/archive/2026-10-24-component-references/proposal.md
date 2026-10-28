# Proposal

## Why

A table or chart Interactive Component can only be pointed at in words today. To ask about
"the cleaned table" or "that bar chart", the user describes it, and a Trait guesses which
component they mean among the Conversation's results. Component references (Roadmap #14)
let the user reference a table or chart in a message, so every Trait works on exactly that
component.

## What Changes

- **`$` references.** A message can reference a whole `table` or `chart` component of its
  Conversation with `$`, written `$name`, for example `$field-trial-cleaned`. References
  name whole components only, never a range of rows or columns.
- **A reference button.** Each table and chart shows a small icon button in its header.
  Clicking it appends the component's `$` chip to the end of the composer text.
- **The `$` list.** Typing `$` in the composer lists the Conversation's tables and charts,
  and picking one inserts its chip.
- **Names.** A table is named after the file it was shown from (its `source`, without the
  extension). A table that comes from no file, such as Profile Data's column summary or a
  table the AI model wrote, is named after its title, or "table" without one. A chart is
  named after its title, or "chart" without one. A later table or chart of the same
  Conversation with a name already taken gets "-2", "-3". Tables shown from a file now always
  name it in `source`, not only previews, with its Asset ID and sheet.
- **The core checks references.** A `component` Text Component carries the referenced
  component's ID. The core rejects a message whose reference points to a component that is
  not a table or chart of the same Conversation.
- **Every Trait can read a reference.** Prompt-based Traits are told the message's `$`
  references with their kind and component ID and read them with read-a-component: a table
  as its rows, naming the full table's file for a preview, and a chart as its plotted data.
  The data Traits and *Plot* read each `$` table as a table, a preview from its full file, in
  message order with the `#` files. A data Trait sent a `$` chart fails, saying it reads
  tables only.
- **Glossary.** The `#selection` example in `openspec/config.yaml` becomes a `$` table or
  chart component.

Out of scope:
- Referencing part of a table (rows, columns or cells), and selecting in a table.
- Referencing the table a chart was drawn from through the chart.
- Reference buttons on the Project Overview.
- Referencing components of another Conversation.
- Copying and exporting tables (issue #9).

## Capabilities

### New Capabilities
- `component-references`: the `$` reference and its label, table and chart names, the
  reference button, the composer's `$` list, how the core checks a reference, and how sent
  references are shown.

### Modified Capabilities
- `conversations`: Text Components gain the `component` kind.
- `interactive-components`: `table` data may name its source file's Asset ID and sheet, and
  a table shown from a file always names it in `source`.
- `conversation-context`: `conversation.results` marks components the call's message
  references as `current`, and `component.read` names the Asset holding a table's full data.
- `tools`: read-a-component names a preview's source Asset, and read-a-table reads a `$`
  table.
- `tool-use`: prompt-based Traits are told the message's `$` references.
- `trait-execution`: the link protocol version becomes 8.
- `data-traits`: data Traits read `$` tables as tables, with the `#` files, and refuse `$`
  charts.

## Impact

- **Cost and data sent:** no new external service, credential or cost. A reference's label
  is part of the message text, so Jev receives it (with the table or chart name in it) as it
  receives `#` file names today; no cell values are sent to Jev.
- **Rust core:** `TextComponent` gets the `component` kind, checked in `conversations.rs`;
  `component.read` resolves a table's source Asset; `conversation.results` marks referenced
  components. Messages are stored as JSON, so `project.sqlite` needs no migration.
- **Sidecar:** `read_component` names a preview's source Asset; the data Traits' table list
  includes `$` tables; the `prompt` adapter lists `$` references; table components record
  their source Asset ID and sheet. The link protocol version goes from 7 to 8, as the
  sidecar relies on the core's new answers.
- **UI:** the reference button in `table.tsx` and `chart.tsx`, `$` chips, and the `$` list in
  the composer (`references.ts`, `Composer.tsx`). Table sorting stays on the header.
- **Compatibility:** tables made before this change have no source Asset ID, so a `$`
  reference to an older preview reads only the rows it shows. Messages with `$` references
  cannot be sent to an older core.
