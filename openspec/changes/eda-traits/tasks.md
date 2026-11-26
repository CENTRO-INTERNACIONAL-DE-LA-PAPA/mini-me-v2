# Tasks

## 1. Empty condition branches

- [x] 1.1 In `src-tauri/src/library.rs`, let `branch_problems` accept a branch with no Steps.
  Verify: one Rust test with an empty condition branch and an empty parallel branch (both
  accepted) passes with `cd src-tauri && cargo test`.
- [x] 1.2 In `sidecar/src/mini_me_sidecar/workflow/graph.py`, compile an empty branch as a
  direct edge to the condition's end or to the parallel branch's end. Verify: tests in
  `sidecar/tests/test_workflow_graph.py` where a condition picks the empty branch (no output,
  the next Step runs, the reply's text comes from the last Step with an output) and where a
  parallel Step has an empty branch (left out of the joined output) pass
  (`cd sidecar && uv run pytest`).

## 2. Dependency

- [x] 2.1 Add `scikit-learn` to `sidecar/pyproject.toml` with `uv add`, which brings `scipy`.
  Verify: `cd sidecar && uv run python -c "import sklearn, scipy"` succeeds and `uv run pytest`
  passes; note the number of files and megabytes the two packages add to the sidecar's
  packages, for the PR.

## 3. Describe Variables (sidecar)

- [x] 3.1 Add `adapters/data/variables.py` with the computation: one summary frame per column
  type (number: count, missing, mean, standard deviation, minimum, quartiles, maximum,
  skewness; text and boolean: count, missing, distinct, most frequent value and its share;
  date: count, missing, first, last, span), and the choice of columns to chart (histograms
  for number columns, count bars for text or boolean columns with at most 30 distinct values,
  8 at most, with the columns left out and why). Verify: one pytest for the summaries of a
  mixed table and one for the chart choice with many columns and a high-cardinality text
  column pass.
- [x] 3.2 Add the shared plan handling the four Traits use: a plan schema with `columns` (and
  each Trait's options), the columns used when it names none, and the named columns left out
  for their type with a reason. Add *Describe Variables*' plan, its adapter
  `data-describe-variables` and its reply: the text with the count of columns of each type and
  the columns not charted, one `table` per type, and the charts drawn from the histogram and
  count bar templates. Verify: pytest for the shared column choice (named, none named, wrong
  type) passes.

## 4. Find Correlations (sidecar)

- [x] 4.1 Add `adapters/data/correlations.py`: pairwise Pearson or Spearman coefficients with the
  rows used and the p-value (scipy), sorted by absolute coefficient, failing with a clear
  message under two number columns. Verify: pytest on a table with a known strong pair and a
  missing value checks the order, the row count and the method passes.
- [x] 4.2 Add the plan (`columns`, `method`), the adapter `data-correlations` and the reply:
  the pairs table, a correlation heatmap and scatter-with-trend charts of the three strongest
  pairs from the templates, and a text naming the strongest pairs and saying a correlation
  does not show cause. Verify: `cd sidecar && uv run pytest` passes.

## 5. Detect Outliers (sidecar)

- [x] 5.1 Add `adapters/data/outliers.py`: per-column bounds at 1.5 or 3 interquartile ranges
  with the count outside them, and, for two or more columns, an Isolation Forest over the
  complete rows (fixed random state), giving the flagged rows with their reasons. Verify:
  pytest with planted outliers checks the bounds, the counts, the multiple of 3 and the
  reasons passes.
- [x] 5.2 Add the plan (`columns`, `multiple`), the adapter `data-outliers` and the reply: the
  bounds table, the flagged rows table, box plots of the columns with flagged values from the
  template, and no saved table file. Verify: `cd sidecar && uv run pytest` passes.

## 6. Find Clusters (sidecar)

- [x] 6.1 Add `adapters/data/clusters.py`: scale the chosen number columns, cluster the
  complete rows with k-means (the given number, or 2 to 8 kept by silhouette on at most 5,000
  rows) or HDBSCAN (k-means above 20,000 rows, with the reason), compute two principal
  components and their explained variance, and return the table with `cluster`, `pc1` and
  `pc2` (empty for rows not clustered) and a per-cluster summary. Verify: pytest on two
  well-separated groups finds 2 clusters, leaves a row with a missing value unclustered, and
  falls back from HDBSCAN on a large table.
- [x] 6.2 Add the plan (`columns`, `method`, `clusters`), the adapter `data-clusters` and the
  reply: save `<name>-clusters.csv`, show the summary table, and draw the scatter template of
  `pc1` against `pc2` grouped by `cluster` from the saved file, naming the explained variance.
  Verify: `cd sidecar && uv run pytest` passes.

## 7. Library and icons

- [ ] 7.1 Add `chart-column`, `chart-scatter`, `radar` and `group` to `TRAIT_ICONS` in
  `src/lib/traitIcons.ts`. Verify: `npx tsc --noEmit` passes and the Trait icon picker lists
  them.
- [ ] 7.2 In `src-tauri/library/builtin.json`, add the four Traits (adapters, icons and colours
  from design.md) and the Exploratory Data Analysis Mini-Me in the Data group, with its
  description, look and Workflow (the four Steps, the "cluster"/"skip" condition and the
  "chart"/"no chart" condition). Verify: `cd src-tauri && cargo test` passes, so the built-in
  library loads.

## 8. In the app

- [ ] 8.1 With the app running (the user runs `npm run tauri dev`): "@Exploratory Data
  Analysis explore #<table>.csv" on a table with several number columns shows the four Steps,
  "cluster" with *Find Clusters* and its saved file, and "no chart"; on a table with one number
  column the first condition answers "skip"; with "… and show mean <value> by <group>" the
  second answers "chart" and *Plot* draws it.

## Workflow follow-up

- Add a "New" line to `CHANGELOG.md` for the Exploratory Data Analysis Mini-Me.
- Archive the change with `/opsx:archive`, syncing its delta specs.
- Ask the user, then open the PR from `feat/eda-traits` into `dev`, noting the bundle size
  increase from 2.1.
