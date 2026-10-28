# Design

## Context

See proposal.md for why. The current state that shapes the approach:

- **Data Traits.** `adapters/data/replies.py` holds one function per Trait. Each one reads
  the tables (`read_tables`), asks the model for a plan with `choose(ctx, Schema, text,
  descriptions)`, drops entries that don't fit the table with `catalogue.problem()`, and
  computes with pandas in `asyncio.to_thread`. It replies with `ctx.write`, `table`
  components (`_table`) and `ctx.write_asset`.
- **Catalogue entries** in `catalogue.py` are Pydantic models joined in plain `Union`s, not
  discriminated unions, because some providers reject `discriminator`.
- **Size limits.** The core accepts component data up to 2 MiB. `preview.py` keeps `table`
  data under 1.5 MB by halving rows.
- **Renderers** get `RendererProps` (`data`, `answer`, `projectId`, `messageId`,
  `componentId`, `replyStatus`). The Mini-Me's colours are known only in `MessageItem`
  (`authorMiniMe.colors`). `InteractiveComponent` wraps each renderer in an error boundary
  that falls back to the component's `text`.
- **Frontend tests** run in Vitest without a DOM. They render with
  `renderToStaticMarkup`, so effects never run.
- **Chart tokens.** `src/index.css` defined `--chart-1` to `--chart-5` as neutrals only, and
  states that a series made by a Mini-Me uses that Mini-Me's colour. DESIGN.md asks for
  charts on a white bordered card, gridlines `#F1F0EB`, a `#0A0A0A` axis and 11px muted
  labels.
- **UI stack rules.** `openspec/config.yaml` says charts use D3 modules with React rendering
  the SVG, and tables use TanStack Table. Both lines change in this change (D6).

## Goals / Non-Goals

**Goals:**

- No change to the Rust core beyond the library: no new event, request method, protocol
  version or migration.
- Chart data is plain JSON that a later app version can still draw. Version 1's shape
  carries values only, never Plot options or styles.
- The renderer's logic (state, building Plot options) is testable without a DOM.

**Non-Goals:**

- A general chart grammar the model can write. The six types are fixed.
- Sharing the chart code with a future Overview or document view. That can reuse
  `chart-model.ts` later.

## Decisions

### D1. Ownership

| Process | Owns |
|---|---|
| Sidecar | Validating the model's chart plan, computing each view's values with pandas, sampling, the reply text |
| Rust core | Nothing new: it stores `component.added` as for any kind, and the library gains *Plot* and Plotter |
| UI | Drawing with Observable Plot, and the hover, legend and view controls, held in React state only |

All durable state stays in the core's event log, as before. The chart's controls have no
durable state at all.

### D2. The model's plan

`catalogue.py` gains `ChartPlan { charts: list[Chart] }`, with no cap on charts. A
`Chart` is one flat model:

```python
class Chart(BaseModel):
    type: Literal["histogram", "bar", "line", "scatter", "box", "heatmap"]
    x: str | None            # histogram, bar, line, scatter, box
    y: str | None            # bar (unless count), line, scatter, box
    columns: list[str]       # heatmap only
    series: str | None       # histogram, bar, line, scatter
    aggregate: Literal["count", "sum", "mean", "median"] | None   # bar, line
    alternatives: list[Literal[...same six...]]
    title: str
```

`problem()` gains a case for `Chart`. It checks that the columns exist and have the types
the spec's chart catalogue requires, and returns the reason used in the reply's
ignored-charts list. Each alternative is checked the same way with the chart's columns: a
valid one becomes a view, and an invalid one is dropped silently.

- **Alternative: one Pydantic model per chart type, joined in a `Union`**, as the checks
  are. That gives each type a tighter schema, but six types times their alternatives make a
  large union that providers fill less reliably. Alternatives also need to reuse the same
  columns under another type, which one flat model makes simple. The cost is that
  `problem()` must check which fields each type needs.

The Trait's `instructions` hold the guidance: choose the fewest charts that answer the
message, prefer a histogram or box for distributions, use line only with a date or ordered
number on `x`, and name alternatives only when they show the same question differently.

### D3. Computing views: `plot.py`

`adapters/data/plot.py` holds pure functions, one per type: `(frame, chart) -> view dict`.

- **histogram:** `numpy.histogram_bin_edges(values, "auto")`, uncapped. Each bin is
  `{ x0, x1, count }`, plus `series` when set. For a date column the edges are computed on
  timestamps and sent as ISO strings.
- **bar:** group by `x` (and `series`) and aggregate, every category, largest first.
- **line:** group by `x` (and `series`) with the aggregate (mean by default), sorted by `x`.
- **scatter:** the raw `(x, y, series)` points.
- **box:** per group, `q1`, `median`, `q3`, whiskers at the most extreme values within
  1.5 IQR, and every outlier, for every group, most rows first.
- **heatmap:** `frame[columns].corr()` as cells `{ x, y, value }`, with `null` for pairs
  without enough values.

Shared helpers:

- **series:** every value, most frequent first.
- **dropping missing rows:** returns the count, which the reply reports.
- **sampling, only to fit:** line and scatter views start with every point. While the
  chart's JSON is over 2,000,000 bytes (the core refuses more than 2 MiB), the largest
  points view's sample is halved with `frame.sample(n, random_state=0)`, so the same table
  gives the same sample. A sampled view carries `sample: { shown, total }`. Any other chart
  too large for the limit is refused by the core, and the reply then gives its text.
- **size check:** the view is serialized, and the sample is halved until the chart is
  under 1.5 MB, as `preview.py` does.

Values are converted to plain JSON (NaN to `null`, numpy scalars to Python numbers), as
`preview._cell` does.

### D4. `chart` version 1 data

```json
{ "title": "Yield by variety",
  "views": [
    { "type": "histogram",
      "x": { "name": "yield", "type": "number" },
      "series": ["Yungay", "Canchán", "Perricholi"],
      "bins": [{ "x0": 0, "x1": 5, "count": 3, "series": "Yungay" }] },
    { "type": "box",
      "x": { "name": "variety", "type": "text" }, "y": { "name": "yield", "type": "number" },
      "groups": [{ "group": "Yungay", "q1": 21, "median": 30, "q3": 38,
                   "low": 8, "high": 62, "outliers": [74] }] } ] }
```

Per type: histogram `bins`, bar `bars [{ x, y, series? }]` plus `aggregate`, line and
scatter `points [{ x, y, series? }]` plus `sample?`, box `groups`, and heatmap `columns` and
`cells`. Each view repeats its column descriptions, so a view can be drawn without the
others. The `text` alternative lists each view in a line, for example "Histogram of yield
by variety: 40 bins, 228 values from 0 to 78.5". This text also goes into history, so
another Mini-Me can talk about the chart.

### D5. The renderer: Observable Plot behind a small model

- **`chart-model.ts`** is pure and tested.
  - **Parsing and state:** it parses the data into typed views. Its state is `{ view,
    hidden }`, with an `initialState` and a reducer for `toggleSeries` and `chooseView`.
    `toggleSeries`
    refuses to hide the last visible series.
  - **Plot options:** `chart-plot.ts` holds `chartSpec(chart, view, hidden, colours,
    width)`, kept apart from the model so the card can load without Plot. It returns the
    options for `Plot.plot`, picking the marks per type, and a tooltip source for each
    hoverable mark:
    - histogram: `rectY`
    - bar: `barY`
    - line: `line` with `dot`s
    - scatter: `dot`
    - box: `rect`, `ruleX` and `dot` from the precomputed statistics, not `Plot.boxY`, which
      would recompute them from raw values we don't send
    - heatmap: `cell` with `text`

    Tests check the marks, the filtered data and the tooltip lines.
- **Tooltips hit-test the shape under the pointer.** Plot's own `tip` shows the nearest
  point, and for bars it measures along x only, so an outlier above a box showed the box.
  Instead, each hoverable mark gets a class naming its tooltip source, and Plot binds each
  shape to the index of its row. On `pointermove`, the figure finds the shape under the
  pointer, looks up its row and shows a React tooltip in DESIGN.md's popover style. Empty
  space and whiskers show nothing.
- **`chart.tsx`** renders the card: the title, a toggle group of views (DESIGN.md's toggle
  style), a legend of series as buttons, and the sample note. The figure
  is `chart-figure.tsx`, loaded with `React.lazy`, where a `ref` `div` receives it. In a `useEffect` on `[view, hidden, width]` it calls
  `Plot.plot(chartSpec(...).options)` and replaces the `div`'s child, then removes it on cleanup.
  The width comes from a `ResizeObserver` on the card.
- **Errors:** effects aren't caught by error boundaries. The effect therefore catches a
  failure and stores it in state, and the next render throws it, so `InteractiveComponent`'s
  boundary shows the `text` as for any renderer.
- **Colours:** `RendererProps` gains `color?: string`, which `MessageItem` fills with the
  author Mini-Me's `solid` colour. Other renderers ignore it.
  - The first series uses `color` (or `--primary` when unknown), series 2 to 8 the new
    tokens `--chart-series-2` to `--chart-series-8` (orange, aqua, blue, yellow, pink,
    green, red), and series past 8 generated colours: oklch lightness 0.64 and chroma 0.15,
    as Mini-Me solids, with the hue stepped by the golden angle (137.5°) from 20°, as the
    avatar maker generates custom hues. Each series' colour comes from its place in the
    view's full list, so hiding a series never repaints the others.
  - The palette order passes the categorical checks for adjacent series on white (normal
    vision ΔE ≥ 15; colour-blind ΔE 7.2 for red and green, legal because the legend and
    the tooltip name every series). Aqua, yellow and pink are under 3:1 on white, so a
    series is never identified by colour alone.
  - Bars, boxes and heatmap cells keep at least 24 px each; a chart with more than fit is
    drawn wider and scrolls sideways inside the card.
  - The heatmap uses a diverging scale from `--chart-2` at −1, through the card colour at
    0, to `color` at +1.
  - Gridlines, axis and label colours follow DESIGN.md through the theme tokens, read from
    CSS variables when the effect runs.
- **Why Observable Plot:** in one call per view it gives axes, scales, legends, and the
  `tip` and `pointer` interaction the user asked for. It is maintained by the D3 team,
  pure JavaScript (ISC licence), and its dependencies (`d3`, `isoformat`,
  `interval-tree-1d`) need no native build, so it runs the same in WebView2, WebKit and
  WebKitGTK.
  - **Alternative: D3 modules with React drawing the SVG,** as `config.yaml` says today.
    That would need every axis, legend, tooltip and hit-testing to be written by hand for
    six chart types.
  - **Alternative: TanStack's `react-charts`.** It is still in beta, and nothing has been
    published since November 2023.

### D6. The table without TanStack Table

`TableView` keeps its markup.

- **Sorting state:** `useState<{ column: number; desc: boolean } | null>` replaces
  `SortingState`, and `initialSorting` takes the same shape.
- **Sorting:** a `useMemo` sorts a copy of the rows. Numbers compare by value, and other
  types with `Intl.Collator(undefined, { numeric: true, sensitivity: "base" })`. `null` is
  last in both directions.
- **Headers:** clicking cycles through ascending, descending and back to unsorted, as
  TanStack did. The arrows and `aria-sort` stay.
- **Removal:** `@tanstack/react-table` is removed from `package.json`.
- **Config:** the "UI stack" lines in `openspec/config.yaml` change to:
  - Charts and plots: Observable Plot, drawn into a container a React component owns. React
    holds the controls' state. D3 is used directly only where Plot can't do the job.
  - Tables: plain React components, styled with the same design tokens.

- **Alternative: keep TanStack Table.** It works, but the table uses only its sorting,
  which is about 30 lines. Removing it leaves one data-display library.

### D7. Library entries

- **The Trait:** *Plot* gets ID `5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7a22`, adapter `data-plot`,
  `components: ["chart"]`, and a fill colour in DESIGN.md's Trait range that is not taken.
- **The Mini-Me:** Plotter gets ID `5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7b16`, placed before
  Investigator so Investigator stays last. Its colour is a new `oklch` family that follows
  DESIGN.md's formula at a hue no other Mini-Me uses, and its ink must have at least 4.5:1
  contrast on its tint. Both colours are shown to the user before they are committed.
- **The adapter:** `PlotData`, `id="data-plot"`, `providers=tuple(PROVIDER_NAMES)`, which
  imports `replies` on demand like the other data adapters.

## Risks / Trade-offs

- **[The model picks a poor chart]** → The instructions steer the choice, alternatives let
  the user switch, and invalid choices are reported rather than drawn.
- **[Many series are hard to tell apart]** → Past the eight palette colours, generated hues
  get closer together as series grow. Every series is still named in the legend, can be
  hidden there, and is named in the tooltip.
- **[A very wide chart]** → Every category is drawn, so charts with many categories scroll
  sideways rather than shrinking their bars.
- **[Plot draws imperatively, outside React]** → The draw happens only inside the effect,
  into a `div` React never renders children into, and it is cleaned up on every redraw. The
  tested model keeps the logic out of that effect.
- **[Bundle size]** → Plot and D3 add about 400 KB minified to the frontend bundle. The
  chart's figure (`chart-figure.tsx`, which imports Plot) is loaded with a dynamic
  `import()`, so the cost is paid only when a Conversation shows a chart.
- **[Sampling hides outliers in large scatter charts]** → The reply and the card both say
  the view is a sample, with its size.
- **[Natural sort differs slightly from TanStack's `alphanumeric`]** → Case is ignored by
  `sensitivity: "base"`. The existing tests pin the numeric and missing-value orders, and a
  test is added for "plot 2" before "plot 10".

## Migration Plan

- No storage or protocol change. Existing Conversations are unchanged, and their `table`
  components sort as before.
- Rollback: an older app shows a `chart` component's `text`, as for any unknown kind.

## Open Questions

- Plotter's and *Plot*'s exact colours (D7). They are chosen during implementation and
  change no spec.
