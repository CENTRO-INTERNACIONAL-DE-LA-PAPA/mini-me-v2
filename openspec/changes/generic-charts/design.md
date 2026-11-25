# Design

## Context

*Plot* is a data adapter (`data-plot`), not a prompt-based Trait. `replies.plot`
(`sidecar/src/mini_me_sidecar/adapters/data/replies.py`) reads the table, asks the model once
for a `ChartPlan` through `choose` (a structured answer by tool calling, which works with every
provider), checks each `Chart` with `chart_problem` (`adapters/data/catalogue.py`), computes
each view in `adapters/data/plot.py` and shows it with show-a-chart. The model sees only the
user's message and the table's description; it never sees an earlier chart.

The UI draws `chart` version 1 in `src/components/interactive/`: `chart-model.ts` (types,
parsing, legend state), `chart-plot.ts` (one Observable Plot spec per view type, with
tooltips), `chart-figure.tsx` (drawing, theme colours, tooltip) and `chart.tsx` (card, view
toggle, legend).

Routing already passes the picked table or chart to a reply as `context.component`
(`ctx.picked_component`), and `ctx.read_component` returns a component's kind, version, text
and source file. The core stores a chart without reading its preview beyond `title`.

## Goals / Non-Goals

**Goals:**
- One path from model answer to figure for every chart; a new chart type is a new template
  file.
- Every number in a chart still computed by pandas on the full table.

**Non-Goals:**
- Plot's own data transforms (bin, group, hexbin, window, …) in a description.
- Changes to the Rust core, the event protocol or routing.

## Decisions

Settled with the user while planning:

- **Chart templates replace the six types.** Each chart type is a JSON template in the
  sidecar; the model picks one and fills its slots. The six types become templates; their
  per-type code in the sidecar and the UI, and their tests, are deleted. There is no free-form
  description the model writes itself.
- **The sidecar computes the data.** Each dataset is built by pandas on the full table; the UI
  only draws.
- **Every Observable Plot mark except `geo`, `graticule`, `sphere` and `image`.**
- **No alternative views.** One description per chart; another form is asked for.
- **No review pass** in this change.

How the parts fit (the sidecar owns the description, its checks and its data; the UI owns
drawing; the Rust core is unchanged and stores the component as today):

1. **Chart templates (sidecar).** One JSON file per chart type in
   `adapters/data/chart_templates/`, loaded by `adapters/data/templates.py`: `name`,
   `description`, `slots` (each with the column types it accepts and whether it is required),
   `value_axis` (where a reference line goes), `facets` (whether a facet column applies) and
   `chart`, a chart description whose strings may hold `{slot}` gaps. The model's schema is a
   flat `ChartChoice`: `template`, `title`, the column slots `x`, `y`, `category`, `value`,
   `group`, `columns`, the `aggregate`, and the style slots `colour`, `scheme`, `log_x`,
   `log_y`, `reference`, `height`, `sort`, `facet`; every field but `template` and `title` is
   optional. The templates' names, descriptions and slots are sent to the model with the
   table, so they are listed only in the files. The bundle copies the package folder whole, so
   the files ship with the sidecar.
2. **Filling a template (sidecar).** Plot checks each filled slot (the column exists and has an
   accepted type, required slots are filled), then fills the gaps. An empty optional slot
   drops what uses it: a channel showing it and its place in a `group` or `sort`. Style slots
   apply to any template: `colour` sets the description's colour, which the UI uses instead of
   the Mini-Me's; `scheme` and `log_x`/`log_y` set scales; `reference` adds a dashed rule on the
   value axis; `sort` "label" drops the templates' sort-by-value option; `facet` adds the
   column to every group and an `fy` (or `fx`, when the template already uses `fy`) channel to
   every mark, with a height of 160 px per panel up to the maximum.
3. **Description model (sidecar, internal).** The filled template is a `ChartDescription`
   (datasets, marks, scales, height, colour), never filled by the model. Mark, channel and
   option names stay text checked against fixed lists, so a template with a wrong name fails
   its format test.
4. **Checks (sidecar).** Only our templates produce descriptions, so their structure is checked
   once, by the template format test: each operation's columns as they stand after the ones
   before it, each mark's dataset and channel columns, statistical marks (box, density, linear
   regression, Bollinger, contour, hull, Voronoi, Delaunay, raster) on a dataset of the table's
   own rows. At runtime Plot checks only what depends on the model or the data: the filled
   slots, and that a log scale has positive values (else it is drawn linear and the reply says
   so).
5. **Data operations (sidecar).** `filter`, `group` (count, sum, mean, median, min, max, std;
   output columns named `count` or `<how>_<column>` unless named), `bin` (number or date;
   `<column>_start` and `<column>_end`; the bin count rule of today's `_bin_count`),
   `correlate` (pairwise Pearson, as `x`, `y`, `correlation`), `unpivot`, `sort` and `top`.
   Rows missing a value in any column a dataset uses are dropped before its operations and
   counted for the reply.
6. **Fitting the size limit (sidecar).** Today's `_fit` becomes generic: raw-row datasets are
   sampled together, scaled by the share over the limit, keeping table order so lines stay in
   order; grouped, binned or correlated datasets are never sampled, and a chart that still
   does not fit is written as text.
7. **Preview and text (sidecar).** `chart` version 2's preview is `{ title, source,
   description, datasets }`, with each dataset `{ columns: [{ name, type }], rows: [[…]],
   sample? }`; rows are arrays to keep the preview small. When the description has no colour
   domain and a mark is coloured by a text or boolean column, the sidecar sets the domain to
   that column's values, most frequent first, so legend order and colours are stable. The text
   describes the chart in plain words, complete enough for a model to draw it again: the title,
   how each dataset is built, each mark with its channels and options, each scale, the height.
8. **Follow-up charts (sidecar).** Jev already picks the file and the component a message
   means. `plot` reads its table as every data Trait does (`read_tables`, which uses Jev's file
   pick); when `ctx.picked_component` is a chart, it reads that chart's text with
   `ctx.read_component` and adds it to the model's material. The reply holds a new chart;
   nothing is stored beyond the preview, and the core is unchanged.
9. **General renderer (UI).** `chart-model.ts` parses version 2 and turns array rows into
   objects, reading date columns as `Date` (as `value` does today). `chart-plot.ts` builds one
   Plot mark per described mark by name from a fixed table of Plot functions, maps channels to
   columns or constants, and builds scales. A mark with no colour gets the Mini-Me's solid; an
   ordinal colour scale gets today's `seriesColour` range; band-scale charts keep the minimum
   band width and scroll sideways. Each mark drawn from rows (not a statistical mark) gets a
   tooltip class whose lines are its channel columns and the row's values, so the existing
   tooltip code in `chart-figure.tsx` stays. Hidden legend values filter the rows of every
   dataset that has the legend's column.
10. **Card (UI).** `chart.tsx` drops the view toggle; the legend lists the colour domain; the
   sample note uses the largest sampled dataset. `catalogue.ts` registers `chart` version 2 and
   removes version 1, so older charts show their text.
11. **Instructions (library).** The *Plot* Trait's instructions in `builtin.json` say how to
   choose a template and fill its slots, how to base a chart on a picked one, and short rules
   for good charts, such as sorting categories by value and using few colours.
12. **Malformed entries are dropped, not the whole answer.** `choose` takes the model's tool
   arguments unchecked and checks each entry of the plan's list (a check, cleaning action or
   chart choice) on its own against its kind's schema. Validate, Clean and Plot run the
   well-formed entries and list the malformed ones under "Not run" / "Not drawn" with the
   first problem found, such as ``map_values: no `column` given``. The answer fails as a
   whole only when it has no list, or when it has entries and none is well-formed. Join,
   Jev's decisions and the Dataverse search keep failing as a whole.
13. **A slot takes every column type its chart can draw there.** Positions of raw rows and
   binned values take number or date; a value that is aggregated, or fed to a statistic (box,
   density, trend line, correlation), takes number; a group or colour takes text, boolean or
   number, a number column that a template colours by being drawn as text labels; a category
   takes text, boolean or number. The template format test draws every template with every
   type each slot accepts, and checks that every slot drawn as a colour takes numbers.
14. **Plot explains, and never fails on the model's answer.** An answer that can't be read (no
   tool call, no chart list, every chart malformed) gives a normal reply that says so in plain
   words. A chart that is not drawn, or an unreadable answer, comes with suggestions computed
   from the table and the templates, not by the model: the table's columns that fit the
   failing slot, and up to three templates whose slots the named columns (or, with none, the
   table's columns) can fill. Validate, Clean and Join keep failing on an unreadable answer.

Alternatives considered:

- **Plot's transforms in the UI** (binX, groupY, hexbin): simpler descriptions, but counts and
  means would come from sampled rows on large tables. Rejected while planning.
- **Vega-Lite or model-written D3:** a new dependency, or model-written code to run; Observable
  Plot is already bundled and drawn by the app.
- **Keeping the six types beside generic charts:** two ways to draw a chart. Rejected while
  planning.
- **The model writes the whole chart description:** any combination of marks, but a large,
  nested schema that a small model (Gemma 4) failed to fill in testing: missing fields,
  channels written as objects, garbled JSON. Replaced by templates, with no free-form
  fallback.
- **Templates in the built-in library (`builtin.json`):** editable in the app later, but the
  core would store and send them to the sidecar. Rejected for now.

## Risks / Trade-offs

- [Small models fail to fill a large, nested schema] → The model fills only a flat choice of
  a template and its slots; the nested description is built by the sidecar.
- [A request that no template fits gets no chart] → Accepted; the fix is a new template.
- [A description passes the sidecar's checks but Plot throws while drawing] → The component's
  renderer fails into its text, as for any failed renderer; the sidecar's checks cover
  columns, datasets and scale types, the usual causes.
- [Statistical marks give no tooltip, unlike today's box plot] → Accepted; their shapes are
  computed by Plot from many rows, so there is no single row to show.
- [Charts drawn before this change lose their figure] → They show their text; a single user,
  no migration of old data.
- [The template list grows the model's material] → One line per template, built from the
  files, so the instructions never repeat it.

## Settled after drafting

The user accepted these recommendations after reviewing the draft:

1. **A chart's text describes it in plain words**, and is what a follow-up reads; the core's
   `component.read` and what is stored are unchanged.
2. **Only Jev's picked chart is passed on**; with none, the model describes a new chart. Plot
   does no chart or file lookup of its own.
3. **Theme colours by default, and a colour or scheme only when the user names one**;
   `openspec/config.yaml`'s UI stack notes the exception.
4. **Statistical marks draw from the table's own rows**, sampled when needed and noted; Plot's
   explicit transforms are not allowed.
5. **The dataviz-skills advice is written in our own words**; nothing is added to the license
   notices.
6. **The `unpivot` operation is added; `auto`, `tip`, `crosshair` and the pointer interactions
   are left out; the description models and checks live in `adapters/data/charts.py`.**
7. **Templates are JSON files in the sidecar, with no free-form fallback.**
8. **A malformed entry in the model's answer is dropped and listed with its reason**, for
   Validate, Clean and Plot alike, rather than repaired or asked for again.
9. **Templates over Vega-Lite or model-written plotting code.** Measured on the same six
   requests, 5 runs each: templates drew 29/30 with qwen and 18/30 with gemma4; Vega-Lite
   specs drew 11/30 and about 5/30, several of them wrong; plotting code gives static images
   and runs model-written code.
10. **Plot explains and suggests, without guessing a repair**; templates are checked by their
   format test rather than at runtime, and their files are compactly formatted.
