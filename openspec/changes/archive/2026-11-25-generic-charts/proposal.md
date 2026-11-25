# Proposal

## Why

The *Plot* Trait can only draw six chart types (histogram, bar, line, scatter, box,
correlation heatmap), each hand-coded in Python and in the UI. A researcher asking for a
dumbbell, a stacked area or small multiples gets the nearest of the six, and every new type
needs code in both places. A follow-up such as "use a log scale" or "colour by site" can only
switch between the six types, because the model never sees how the earlier chart was made.

## What Changes

- **Chart templates:** each chart type is a JSON template shipped with the sidecar: named
  datasets built from the table by data operations (filter, group and aggregate, bin,
  correlate, unpivot, sort, top N), the Observable Plot marks to draw and the scales, with gaps
  for slots such as `category` or `value`. The model picks a template and fills its slots and
  the style slots every template shares (colour, log scale, reference line, height, sort,
  facet), a small flat answer that small models fill reliably.
- **Data operations run in the sidecar:** *Plot* checks the slots against the table, fills the
  template and runs each dataset's operations with pandas on the full table, so counts and
  means stay exact. Rows are sampled only to fit the component size limit, as today.
- **One general renderer:** the UI turns any chart description into an Observable Plot
  figure, with tooltips, a legend that hides and shows values, and the theme's colours.
- **Every mark except maps and images:** templates may use every Observable Plot mark except
  `geo`, `graticule`, `sphere` and `image`.
- **Built-in templates:** the six current types and new ones (dumbbell, lollipop, area,
  stacked and grouped bars, density, ridgeline, range bars, slope chart and more). A new chart
  type is a new template file, not new code.
- **Follow-up charts:** a chart's text describes it in plain words. When Jev picks a chart for
  a follow-up such as "make it red", Plot gives the model that chart's text, and the reply
  holds a new chart based on it; the earlier chart is unchanged.
- **Replies that explain:** each chart's line says which template and columns it drew. A
  chart that can't be drawn from the columns the request named is not drawn with others
  instead: the reply says why and suggests columns and charts that fit, computed from the
  table. A malformed entry in the model's answer is dropped and listed, for Validate and Clean
  too, and Plot never fails on the model's answer.
- **Messages in the Mini-Me's voice:** fallback and failure messages of the data Traits, the
  Dataverse search and Jev's decisions say "I" and no longer name the AI model.
- **BREAKING:** `chart` moves to version 2, whose preview is a chart description with its
  datasets. Version 1 and its renderer are removed; charts drawn before show their text.
- **Removed:** the six per-type code paths in the sidecar and the UI, their tests, and
  alternative views (the toggle between, for example, a histogram and a box plot). To see
  another form, the user asks for it.

Out of scope: saving a chart as SVG or PNG, a second check of a chart against common chart
mistakes, D3-drawn or model-written visualizations, maps, and selecting points in a chart.

No new external service, credential or cost: the template choice is one structured answer
from the user's chosen model, as *Plot*'s choice of chart is today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-traits`: the *Plot* Trait chooses a chart template and fills its slots; the
  chart catalogue, series and alternative-view requirements give way to chart templates, slots,
  data operations, allowed marks and follow-up charts; sampling and replies apply to any chart.
- `interactive-components`: `chart` version 2 holds a chart description and its datasets;
  the card, tooltips and legend work for any description; switching views is removed.

## Impact

- Sidecar: `sidecar/src/mini_me_sidecar/adapters/data/plot.py`, new `charts.py`,
  `templates.py` and `chart_templates/`, the chart models removed from `catalogue.py`,
  `choose.py` and `replies.py`, `adapters/providers.py` (raw tool arguments), the messages in
  `adapters/dataverse.py` and `workflow/decide.py`, and their tests.
- UI: `src/components/interactive/chart-plot.ts`, `chart-model.ts`, `chart.tsx`,
  `chart-figure.tsx`, and their tests.
- Library: the *Plot* Trait's instructions in `src-tauri/library/builtin.json`.
- Rules: `openspec/config.yaml` gains the rule on fallback messages.
- Rust core: no change. The core stores and checks components without reading a chart's
  preview beyond its `title`.
- No new dependency: Observable Plot is already bundled.
