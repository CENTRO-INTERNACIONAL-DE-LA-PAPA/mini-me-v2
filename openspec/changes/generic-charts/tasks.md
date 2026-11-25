# Tasks

## 1. Chart description and checks (sidecar)

- [x] 1.1 In a new `adapters/data/charts.py`, add the `ChartPlan` / `ChartDescription` models (datasets, operations, marks,
  channels, options, scales, height) with the fixed lists from design.md, replacing `Chart`,
  `ChartPlan`, `CHART_AXES` and `chart_problem` in `catalogue.py`. Verify: `cd sidecar && uv
  run pytest` collects without import errors.
- [x] 1.2 Add the checks: operations against the columns as they stand, marks against their
  dataset's columns, statistical marks against raw-row datasets, log scales against positive
  values; a check returns the valid description and the ignored parts with reasons. Verify:
  one pytest per rule group (operations, marks, scales) passes.

## 2. Data operations, fitting and text (sidecar)

- [x] 2.1 Rewrite `plot.py` around datasets: run `filter`, `group`, `bin`, `correlate`,
  `unpivot`, `sort` and `top` with pandas; drop and count rows missing a used value; keep only
  used columns; set a colour domain by frequency when none is given. Delete the per-type
  functions and their tests in `test_plot.py`. Verify: pytest for a histogram (bin then
  count), group aggregates, correlations and dates passes.
- [x] 2.2 Make fitting generic: sample raw-row datasets together in table order, never sample
  grouped, binned or correlated ones, and mark a chart that still does not fit as text-only.
  Write the version 2 preview and the text (the chart in plain words: title, datasets, marks,
  scales, height). Verify: pytest for sampling the same way twice and for an unfit chart
  passes.

## 3. Plot reply (sidecar)

- [x] 3.1 Update `replies.plot`: when Jev picked a chart, read its text and send it to the
  model with the table's description;
  draw every chart with a valid mark as `chart` version 2; list ignored charts and parts.
  Verify: `cd sidecar && uv run pytest` passes.

## 4. General renderer (UI)

- [x] 4.1 Rewrite `chart-model.ts` for version 2: types, parsing (array rows to objects,
  dates to `Date`), the colour domain as legend, and the hide/show reducer over legend values.
  Verify: `chart-model.test.ts` cases for parsing, refusing bad data and hiding values pass
  (`npm test`).
- [x] 4.2 Rewrite `chart-plot.ts` to build Plot options from a description: marks by name
  from a fixed table, channels to columns or constants, scales, the Mini-Me's colour for
  uncoloured marks, the series colours for ordinal colour scales, band width, and tooltip
  lines for row marks. Verify: tests that a dumbbell description gives a rule and a dot mark,
  that hidden values leave the data, and that statistical marks get no tooltip pass, and
  `npx tsc --noEmit` is clean.
- [x] 4.3 Update `chart.tsx` and `chart-figure.tsx`: no view toggle, legend from the colour
  domain, sample note, height; register `chart` version 2 in `catalogue.ts` and remove
  version 1. Verify: `chart.test.tsx` shows the title, legend and sample note, and `npm test`
  passes.

## 5. Instructions (library)

- [x] 5.1 Rewrite the *Plot* Trait's instructions in `src-tauri/library/builtin.json`: how to
  choose a template and fill its slots and style slots, follow-up charts based on the picked
  chart's text, and the chart-quality rules in our own words. Add the colour exception to
  `openspec/config.yaml`'s UI stack. Verify: `cd src-tauri && cargo test` passes (built-in
  library format).

## 6. Chart templates (sidecar)

- [x] 6.1 Make the model's answer a flat `ChartChoice` (template, title, column slots,
  aggregate, style slots) and add `adapters/data/templates.py`, which loads the JSON
  templates, lists them for the model, checks a choice's slots against the table and fills a
  template into a `ChartDescription` with the style slots applied. Verify: pytest for slot
  checks, empty optional slots and style slots passes.
- [x] 6.2 Write the built-in templates in `adapters/data/chart_templates/`: histogram, bar,
  count bar, stacked bars, grouped bars, lollipop, range bars, line, area, stacked area, slope,
  dumbbell, scatter, scatter with trend line, box, density, ridgeline, correlation heatmap,
  waffle. Verify: a format test that every template loads, uses only allowed marks and its
  own slots, and fills into a chart that passes `check_chart`.
- [x] 6.3 Update `replies.plot` to check and fill each choice before drawing, write the
  chart's text from its template and slots, and let the UI use a description's `colour`.
  Verify: `uv run pytest`, `npm test` and `npx tsc --noEmit` pass.
- [x] 6.4 Check each entry of the model's answer on its own: `providers.py` hands `choose`
  the tool arguments unchecked, `choose` keeps the well-formed entries and returns the
  malformed ones with a reason, and Validate, Clean and Plot list them as not run or not
  drawn. Verify: pytest for a plan with one good and one malformed entry passes.

## 7. Simpler checks, clearer replies (sidecar)

- [x] 7.1 Check templates in the format test only: Plot stops running `check_chart` at
  runtime, keeping the slot check and the log-scale check on the data; the structural checks
  move into the test, and code nothing else uses is deleted. Verify: `uv run pytest` passes.
- [ ] 7.2 Apply the slot-type rule to every template and add it to the format test. A number
  group is coloured as categories. Verify: pytest, `npm test` and `npx tsc --noEmit` pass.
- [ ] 7.3 Plot explains an unreadable answer in its reply instead of failing; `choose` reports
  it to Plot, and Validate, Clean and Join keep failing. Verify: pytest for an answer with no
  tool call passes.
- [ ] 7.4 Suggestions under each chart not drawn and under an unreadable answer: columns that
  fit the failing slot, and up to three templates that fit. Verify: pytest for a box plot whose
  `value` is a text column passes.
- [ ] 7.5 Format the template files compactly. Verify: the format test passes.

## 8. In the app

- [ ] 8.1 With Plotter on a sample table: a histogram, a bar chart by category, a dumbbell, a
  stacked area and small multiples draw with tooltips and legend; "use a log scale" and
  "colour by site" change the last chart; "make the bars blue" draws blue bars; a large table
  shows the sample note; a chart drawn before this change shows its text; featuring a chart
  on the Overview still works; a malformed entry in the model's answer is listed and the
  rest still run; a chart that doesn't fit is explained with suggestions; an unreadable
  answer gets a reply, not "Failed".

## Workflow follow-up

- Add to `CHANGELOG.md` under "New": Plotter draws many more kinds of chart, and changes a
  chart when you ask.
- Archive the change (`/opsx:archive`), syncing its deltas into `openspec/specs/`.
- Open the pull request into `dev`.
