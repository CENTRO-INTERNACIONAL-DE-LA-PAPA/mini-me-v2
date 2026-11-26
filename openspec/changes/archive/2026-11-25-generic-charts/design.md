# Design

## Context

*Plot* is a data adapter (`data-plot`), not a prompt-based Trait. `replies.plot`
(`sidecar/src/mini_me_sidecar/adapters/data/replies.py`) reads the table, asks the model once
for a plan through `choose` (a structured answer by tool calling, which works with every
provider), computes each chart in `adapters/data/plot.py` and shows it with show-a-chart. Before
this change the plan named one of six chart types, each computed by its own code in the sidecar
and drawn by its own code in the UI (`src/components/interactive/`), and the model never saw an
earlier chart.

Routing passes the picked table or chart to a reply as `context.component`
(`ctx.picked_component`), and `ctx.read_component` returns a component's kind, version, text
and source file. The core stores a chart without reading its preview beyond `title`.

## Goals / Non-Goals

**Goals:**
- One path from model answer to figure for every chart; a new chart type is a new template
  file.
- Every number in a chart computed by pandas on the full table.
- A request gives one outcome: the chart asked for, or a plain explanation of why it can't be
  drawn and what could be.

**Non-Goals:**
- Plot's own data transforms (bin, group, hexbin, window, …) in a description.
- Changes to the Rust core, the event protocol or routing.
- Earlier messages for data Traits: Plot sees the message, the table and a picked chart only.

## Decisions

The sidecar owns the templates, the description, its data and the reply; the UI owns drawing;
the Rust core is unchanged and stores the component as before.

1. **Chart templates (sidecar).** Each chart type is one JSON file in
   `adapters/data/chart_templates/`, loaded by `adapters/data/templates.py`: `name`,
   `description`, `slots` (each with the column types it accepts and whether it is required),
   `value_axis` (where a reference line goes), `facets` (whether a facet column applies) and
   `chart`, a chart description whose strings may hold `{slot}`, `{aggregate}` and
   `{Aggregate}` gaps. The built-in templates are histogram, bar, count bars, stacked bars,
   grouped bars, lollipop, range bars, line, area, stacked area, slope, dumbbell, scatter,
   scatter with trend line, box, density, ridgeline, correlation heatmap and waffle. The
   templates' names, descriptions and slots are sent to the model with the table, so they are
   listed only in the files. The files are formatted compactly, and the bundle copies the
   package folder whole, so they ship with the sidecar. There is no free-form description the
   model writes itself.
2. **The model's answer (sidecar).** A flat `ChartChoice`: `template`, `title`, the column
   slots `x`, `y`, `category`, `value`, `group` and `correlated_columns` (used only by the
   correlation heatmap), the `aggregate`, and the style slots `colour`, `scheme`, `log_x`,
   `log_y`, `reference`, `height`, `sort`, `facet`; every field but `template` and `title` is
   optional. Slots the chosen template doesn't have are cleared before the choice is checked,
   so a stray value there can't sink it; a column named only in such a slot is listed in the
   reply as having no place in the chart.
3. **A slot takes every column type its chart can draw there.** Positions of raw rows and
   binned values take number or date; a value that is aggregated, or fed to a statistic (box,
   density, trend line, correlation), takes number; a group or colour takes text, boolean or
   number; a category takes text, boolean or number. A number column a template colours by is
   drawn as text labels, so it gets a legend of categories rather than a gradient.
4. **Filling a template (sidecar).** Plot checks each filled slot (the column exists and has an
   accepted type, required slots are filled), then fills the gaps. An empty optional slot drops
   what uses it: a channel showing it and its place in a `group` or `sort`. Style slots apply to
   any template: `colour` sets the chart's colour, used instead of the Mini-Me's, when it is a
   colour; `scheme` sets the colour scale when it is a known scheme; `log_x`/`log_y` set scales;
   `reference` adds a dashed rule on the value axis; `sort` "label" drops the sort-by-value
   option; `height` is kept between 200 and 800 px; `facet` adds the column to every group and
   an `fy` (or `fx`, when the template already uses `fy`) channel to every mark, with 160 px per
   panel up to the maximum. Axis labels come from the columns: "Count of `<column>`" on count
   axes and "`<Aggregate>` of `<column>`" on aggregated ones, filled from the same values as the
   computation, so a label always names what its axis shows.
5. **Description and checks (sidecar).** A filled template is a `ChartDescription` (datasets,
   marks, scales, height, colour) in `adapters/data/charts.py`, never filled by the model. Only
   our templates produce descriptions, so their structure is checked once, by the template
   format test: every mark, channel and option name is allowed, statistical marks (box,
   density, linear regression, Bollinger, contour, hull, Voronoi, Delaunay, raster) draw a
   dataset of the table's own rows, and every template builds with every type each slot
   accepts. At runtime Plot checks only what depends on the model or the data: the filled
   slots, the style values, and that a log scale has positive values (else it is drawn linear
   and the reply says so). Templates may use every Observable Plot mark except `geo`,
   `graticule`, `sphere` and `image`, and `auto`, `tip` and `crosshair`, whose tooltips the app
   draws.
6. **Data operations (sidecar).** `filter`, `group` (count, sum, mean, median, min, max, std;
   output columns named `count` or `<how>_<column>` unless named), `bin` (number or date;
   `<column>_start` and `<column>_end`), `correlate` (pairwise Pearson, as `x`, `y`,
   `correlation`), `unpivot`, `sort` and `top`. Rows missing a value in any column a dataset
   uses are dropped before its operations and counted for the reply.
7. **Fitting the size limit (sidecar).** Raw-row datasets are sampled together, scaled by the
   share over the limit, keeping table order so lines stay in order; grouped, binned or
   correlated datasets are never sampled, and a chart that still does not fit is written as
   text.
8. **Preview and text (sidecar).** `chart` version 2's preview is `{ title, source,
   description, datasets }`, with each dataset `{ columns: [{ name, type }], rows: [[…]],
   sample? }`; rows are arrays to keep the preview small. When a mark is coloured by a text or
   boolean column, the sidecar sets the colour domain to that column's values, most frequent
   first, so legend order and colours are stable. A chart's text is its title, its template
   with its slots (an empty optional slot as "no <slot>") and style, and the rows each dataset
   holds, complete enough for a model to base a new chart on it.
9. **Follow-up charts (sidecar).** Jev picks the file and the component a message means.
   `plot` reads its table as every data Trait does (`read_tables`); when `ctx.picked_component`
   is a chart, it reads that chart's text and adds it to the model's material. The reply holds
   a new chart; the earlier chart is unchanged.
10. **Malformed entries are dropped, not the whole answer.** `choose` takes the model's tool
   arguments unchecked and checks each entry of the plan's list (a check, cleaning action or
   chart choice) on its own against its kind's schema. Validate, Clean and Plot use the
   well-formed entries and list the malformed ones with the first problem found, such as
   ``map_values: no `column` given``. The answer is unusable only when it has no list, or when
   it has entries and none is well-formed.
11. **Plot explains, and never fails on the model's answer.** An unusable answer gives a normal
   reply: "I couldn't make a chart of `<table>` from this request", with suggestions. Each
   drawn chart's line names its template and slots, so what was drawn shows whatever words the
   request used. A chart that is not drawn is listed under "I couldn't draw this from
   `<table>`:" (or "I left these out:" beside drawn charts) with its reason and suggestions
   computed from the table and the templates, not by the model: the table's columns that fit
   each failing slot, and up to three templates that the named columns can fill, filling
   optional slots with the other named columns and putting charts that use more of them
   first; with no named column, the simplest charts of the table. Validate, Clean and Join
   still fail on an unusable answer, with a message in the Mini-Me's voice.
12. **One request, one outcome.** The *Plot* Trait's instructions in `builtin.json` tell the
   model to use exactly the columns the message names, in the roles it gives them, never
   another in their place, and to choose the closest template for them even when they don't
   fit, so the reply can say why. They also say how to fill style slots, how to base a chart
   on a picked one, and short rules for good charts.
13. **Messages speak as the Mini-Me.** A fallback or failure the user sees says "I" and never
   names or blames the AI model, unless the problem is specific to that model; this holds for
   Plot, Validate, Clean, Join, the Dataverse search and Jev's decisions, and is a rule in
   `openspec/config.yaml`.
14. **General renderer (UI).** `chart-model.ts` parses version 2 and turns array rows into
   objects, reading date columns as `Date`. `chart-plot.ts` builds one Plot mark per described
   mark by name from a fixed table of Plot functions, maps channels to columns or constants,
   and builds scales. A mark with no colour gets the chart's or the Mini-Me's colour; an
   ordinal colour scale gets the theme's series colours; band-scale charts keep a minimum band
   width and scroll sideways. Each mark drawn from rows (not a statistical mark) gets tooltips
   listing its channel columns and the row's values. Hidden legend values filter the rows of
   every dataset that has the legend's column.
15. **Card (UI).** `chart.tsx` has no view toggle; the legend lists the colour domain; the
   sample note uses the largest sampled dataset. It has a renderer for `chart` version 2 only,
   so charts drawn before it show their text.

Alternatives considered:

- **Plot's transforms in the UI** (binX, groupY, hexbin): simpler descriptions, but counts and
  means would come from sampled rows on large tables.
- **The model writes the whole chart description:** any combination of marks, but a large,
  nested schema that a small model failed to fill: missing fields, channels written as
  objects, garbled JSON.
- **Vega-Lite specs written by the model:** measured on six requests, 5 runs each, templates
  drew 29/30 with qwen and 18/30 with gemma4; Vega-Lite drew 11/30 and about 5/30, several of
  them wrong, and would replace the renderer.
- **Model-written plotting code (matplotlib), as in Mini-Me v1:** static images, and running
  code a model wrote.
- **Keeping the six types beside generic charts:** two ways to draw a chart.
- **Templates in the built-in library (`builtin.json`):** editable in the app later, but the
  core would store and send them to the sidecar.
- **Repairing a misplaced column, or asking the model again:** guesses or a second call; the
  reply explains and suggests instead.

## Risks / Trade-offs

- [Which columns are used depends on the model following its instructions] → Every model gets
  the same instructions; each chart's line in the reply names its template and slots, so a
  mismatch is visible.
- [A request that no template fits gets no chart] → The reply says why and suggests charts
  that fit; the fix for a missing type is a new template.
- [A description builds in the sidecar but Plot throws while drawing] → The component's
  renderer fails into its text, as for any failed renderer.
- [Statistical marks give no tooltip] → Accepted; their shapes are computed by Plot from many
  rows, so there is no single row to show.
- [Charts drawn before this change lose their figure] → They show their text; a single user,
  no migration of old data.
- [The template list grows the model's material] → One line per template, built from the
  files.
- [A chart's title comes from the model and can disagree with what was drawn] → The line under
  it names the template and slots.

## Settled with the user

Every decision above was made or accepted by the user. Points the user settled after reviewing
drafts:

1. A chart's text describes it in plain words and is what a follow-up reads.
2. Only Jev's picked chart is passed on; Plot does no chart or file lookup of its own.
3. Theme colours by default, and a colour or scheme only when the user names one.
4. Statistical marks draw from the table's own rows, sampled when needed and noted.
5. The dataviz-skills advice is written in our own words; nothing is added to the license
   notices.
6. The `unpivot` operation is added; `auto`, `tip`, `crosshair` and the pointer interactions
   are left out.
7. Templates are JSON files in the sidecar, over Vega-Lite or model-written plotting code.
8. Malformed entries are dropped and listed, for Validate, Clean and Plot alike.
9. Plot explains and suggests without guessing a repair, and never substitutes a column the
   request named.
10. Fallback messages speak as the Mini-Me.
