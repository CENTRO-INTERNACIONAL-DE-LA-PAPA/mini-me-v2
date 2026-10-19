# Tasks

## 1. Table sorting without TanStack Table

- [x] 1.1 In `src/components/interactive/table.tsx`, replace `useReactTable` with the plain React sorting from design D6: a `{ column, desc } | null` state (also used by `initialSorting`), numbers by value, other types through `Intl.Collator(undefined, { numeric: true, sensitivity: "base" })`, `null` last in both directions, headers cycling ascending → descending → unsorted, with the arrows and `aria-sort` unchanged. Verify: `npm test` passes `table.test.tsx` with `initialSorting` in the new shape, plus a new case that sorts "plot 10", "plot 2" and "Plot 1" as "Plot 1", "plot 2", "plot 10".
- [x] 1.2 Remove `@tanstack/react-table` from `package.json` and `package-lock.json` with `npm uninstall`. Verify: `grep -r tanstack src` finds nothing, and `npx tsc --noEmit` and `npm test` pass.

## 2. Chart catalogue and computation in the sidecar

- [x] 2.1 Add `Chart` and `ChartPlan` to `adapters/data/catalogue.py` as in design D2, and extend `problem()` to check each type's required columns and column types against the spec's chart catalogue, returning the reason for the reply. Add `describe_entry` text for charts. Verify: `tests/test_catalogue.py` covers a histogram of a text column (refused), a bar chart with aggregate count and no `y` (accepted), a heatmap of one column (refused), and an unknown column (refused).
- [x] 2.2 Add `adapters/data/plot.py` with one function per chart type plus the shared series, missing-row and sample-to-fit helpers from design D3, returning the view dicts of design D4 with plain-JSON values. Verify: a new `tests/test_plot.py` checks histogram bin counts summing to the non-missing rows, a bar mean for every one of 35 categories, every one of 9 series kept, box quartiles on a known list, a heatmap's diagonal of 1, all 12,000 points of a scatter that fits, a 120,000-point scatter sampled under the size limit with the same sample on two runs, and the missing-row count.
- [x] 2.3 Add the `chart` component's `text` (one line per view, as in design D4) next to the view builders. Verify: `tests/test_plot.py` checks the text of a histogram with series and of a sampled scatter.

## 3. The Plot Trait and Plotter

- [x] 3.1 Add `plot(ctx, text)` to `adapters/data/replies.py`: read the tables, ask `choose(ctx, ChartPlan, …)` with the first table's description, drop invalid charts and alternatives, compute the views in `asyncio.to_thread`, add one `chart` component per valid chart, and write the reply lines from the data-traits spec (rows left out, sampling, unused tables, ignored charts, and no failure when no chart is valid). Add the `PlotData` adapter (`id="data-plot"`) to `adapters/data/__init__.py` and register it in `adapters/__init__.py`. Verify: `cd sidecar && uv run pytest` passes, and `load_adapters(False)` includes `data-plot`.
- [x] 3.2 Add *Plot* (ID `…7a22`, adapter `data-plot`, `components: ["chart"]`, instructions from design D2) and Plotter (ID `…7b16`, before Investigator, one Step `plot`) to `src-tauri/library/builtin.json`. Propose their colours (design D7) and get the user's approval before writing them. Update the `library.rs` tests: the components list includes `("Plot", vec!["chart"])`, `mini_mes_run_their_step_trait` includes Plotter, and the Mini-Me count becomes 15 (renaming the test). Verify: `cd src-tauri && cargo test library` passes.

## 4. The chart renderer

- [x] 4.1 Add `@observablehq/plot` with `npm install`, pinned in `package-lock.json`. Verify: `npx tsc --noEmit` passes with `import * as Plot from "@observablehq/plot"` in a new file.
- [x] 4.2 Add `src/components/interactive/chart-model.ts` (design D5): the version 1 types, parsing, `initialState`, a reducer for `toggleSeries` (never hiding the last series) and `chooseView`, and, in `chart-plot.ts`, `chartSpec(chart, view, hidden, colours, width)` with the marks per type and a hit-tested tooltip source for each hoverable mark. Verify: a new `chart-model.test.ts` covers toggling and the last-series guard, switching views, hidden series filtered out of the marks' data, the box view built from the precomputed statistics, a distinct colour for each of 30 series (palette first, then generated), the box and outlier tooltip lines, and the heatmap's diverging domain [−1, 1].
- [x] 4.3 Add `color?: string` to `RendererProps` in `catalogue.ts`, pass it through `InteractiveComponent`, and fill it in `MessageItem` with the author Mini-Me's `solid` colour. Verify: `npx tsc --noEmit` passes and the existing interactive tests pass.
- [x] 4.4 Add `src/components/interactive/chart.tsx` with `renderers = { 1: Chart }`: the card, title, view toggle, legend buttons, the "Sample of n of m points" note, and the Plot figure drawn in an effect into a `ref` container, sized by a `ResizeObserver`, cleaned up on redraw, with effect errors rethrown during render (design D5). Register `chart` in `catalogue.ts`; the figure (`chart-figure.tsx`) is loaded with a dynamic `import()` so Plot loads only when a chart is shown. Verify: `npm test` passes, including the catalogue test that every kind a built-in Trait lists has a renderer, and a `chart.test.tsx` case that renders the card's title, toggle and sample note with `renderToStaticMarkup`.
- [x] 4.5 Style the card and figure to DESIGN.md: a white bordered card with radius 10, gridlines `--line-soft`, a `#0A0A0A` axis, 11px muted labels, the toggle group style, and the tooltip in the popover style, all through theme tokens. Verify: the user checks a histogram, a multi-series line and a heatmap in the app.

## 5. Documentation

- [x] 5.1 Update the "UI stack" lines for charts and tables in `openspec/config.yaml` as in design D6, and the README's "Built with" (Observable Plot for charts, no TanStack Table). Verify: `grep -n -i tanstack README.md openspec/config.yaml` finds only the Roadmap row for #10.
- [x] 5.2 In `docs/architecture.md`, add `data-plot` to the adapters table and the data adapters paragraph, add `chart.tsx` and `chart-model.ts` to the Interactive Components file list, and add `color` to the renderer props. Verify: the user reviews the diff.

## 6. In the app

- [x] 6.1 With a model set, send "@Plotter #field-trial.csv show how yield is distributed by variety" and "@Plotter #field-trial.csv plot yield against plant height". Verify, with the user: each reply shows a chart with no table, hover shows exact values, the legend hides and shows a variety, the view toggle switches to the alternative, and reopening the Conversation shows the first view.
- [x] 6.2 Ask Plotter for a chart of a column the table doesn't have, and send a message with no model set. Verify, with the user: the first reply lists the ignored chart with no component and does not fail, and no data reply ends with a "Shared with the AI model" line, and the second fails with "Choose an AI model in Settings first."
- [x] 6.3 Profile, validate, clean and join the sample tables. Verify, with the user: their tables still sort by clicking headers, with empty cells last.

## Workflow follow-up

- Archive the change with `/opsx:archive`, syncing the delta specs into `openspec/specs/`.
- Mark #12 "Done" in the README Roadmap and the next row "Next".
- Ask the user, then open the pull request from `feat/charts` into `dev`.
