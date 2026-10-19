# Proposal

## Why

The data Traits can describe, check, clean and join a table, but a scientist still has to
leave Mini-Me to see the data as a graph: a yield distribution, a trend over the season,
or treatments compared side by side. Roadmap #12 adds charts. Charts come from their own
Trait and Mini-Me, so a scientist chooses when a graph is wanted, and the other data Traits
keep replying with tables.

## What Changes

- **A new data Trait, *Plot***, run by a new sidecar adapter `data-plot`. Plot follows the
  data Traits' rules: the model chooses from a fixed catalogue, pandas computes every value,
  and the model never sees rows.
  - **Chart types:** histogram, bar, line over time, scatter, box plot by group and
    correlation heatmap. The model picks the types that fit the message and the table's
    description, and maps columns to the x and y axes, a series column or a group column.
  - **Alternative views:** for each chart, the model may also name other suitable types for
    the same columns. The adapter computes their data too, so the user can switch between
    them.
  - **Invalid choices** (unknown columns, a column of the wrong type for the chart) are
    dropped and listed in the reply, as *Clean Data* does.
  - **What a chart carries:** only what it needs: histogram bins, grouped totals or
    averages, box-plot statistics, correlations, or the points of a line or scatter chart.
    Every series, category and outlier is kept. Line and scatter points are sampled only
    when a chart would not fit the core's 2 MiB component limit, and the reply says so.
- **A new predefined Mini-Me, Plotter:** "Draws charts of a data table", with one Step
  running *Plot*. It gets a new colour family, chosen during implementation as for
  Investigator.
- **A new Interactive Component kind, `chart` version 1:** a chart type, the columns it uses,
  the computed values and its alternative views, with no drawing code. The UI draws it with
  Observable Plot inside a white bordered card, as DESIGN.md requires. Its controls change
  only what the UI shows:
  - hovering a point, bar, box or cell shows its exact values;
  - clicking a legend entry hides or shows that series;
  - a toggle switches between the chart's views.

  Nothing about these controls is saved, so a reopened Conversation shows each chart as it
  first appeared.
- **Data replies no longer end with the "Shared with the AI model" line**, in every data
  Trait. What the model receives is unchanged.
- **Series colours:** the first series takes the Mini-Me's colour, the next seven a new
  validated series palette in `src/index.css` and DESIGN.md, and any further series
  generated colours (fixed oklch lightness and chroma, spread hues), so every series has
  its own colour. Charts with many bars, boxes or cells scroll sideways.
- **A Plot reply shows charts only, no `table` component.** *Profile Data*, *Validate Data*,
  *Clean Data* and *Join Data* keep their tables unchanged.
- **The table renderer drops TanStack Table.** Sorting is written in plain React, with the
  same behaviour: numbers by value, text in natural order ("plot 2" before "plot 10"), and
  empty cells last in both directions. The frontend's only data-display library is then
  Observable Plot, which brings D3 with it.

## Out of scope

- Charts from any Trait other than *Plot*, including from `prompt` Traits or other data
  Traits.
- Charts that combine several tables. *Plot* draws from the first table it reads. A user
  who wants to combine tables can join them first with Linker.
- Chart types beyond the six listed. Maps, zooming, brushing to select points, and exporting
  a chart as an image are also out of scope.
- Referencing a chart or a selection inside it with `#`.
- Saving the state of a chart's controls.
- Using Plot inside a multi-Step Workflow. It works as any Trait does, but no predefined
  Mini-Me other than Plotter uses it.

**Data leaving the machine:** *Plot* sends the same description of the table that *Validate
Data* and *Clean Data* send (names, types, statistics and the top values of low-cardinality
columns, never rows) to the AI provider chosen in Settings. There is no new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-traits`: adds the *Plot* Trait. It covers the chart catalogue, what the model
  chooses, what pandas computes for each chart type, sampling to fit the size limit, and what
  the reply says.
- `interactive-components`: adds the `chart` kind (its data, how it is drawn and its UI-only
  controls). The table's sorting requirement is unchanged; only its implementation changes.
- `mini-mes`: the library gains *Plot*, which lists `chart`, and Mini-Me ships with fifteen
  predefined Mini-Mes, adding Plotter.

## Impact

- **Sidecar:** a new `data-plot` adapter in `adapters/data/`, a chart catalogue in
  `catalogue.py`, and a `plot.py` module that computes each chart type's data with pandas.
  No new Python dependency.
- **UI:** a `chart` renderer and its model in `src/components/interactive/`, and replies pass
  their Mini-Me's colour to renderers. `@observablehq/plot` is added (ISC licence, pure
  JavaScript; it depends on `d3`, `isoformat` and `interval-tree-1d`). `@tanstack/react-table`
  is removed, and `table.tsx` sorts on its own.
- **Library:** *Plot* and Plotter are added to `src-tauri/library/builtin.json`, and the
  `library.rs` tests are updated.
- **Docs:** the "UI stack" lines in `openspec/config.yaml` (charts and tables), the README's
  "Built with" list, and `docs/architecture.md`.
- No change to the event or link protocol, the database or Rust logic.
