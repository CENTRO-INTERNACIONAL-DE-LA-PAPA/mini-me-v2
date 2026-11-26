# Tasks

## 1. Dependency

- [x] 1.1 Ask the user to run `cd sidecar && uv add statsmodels`. Verify:
  `cd sidecar && uv run python -c "import statsmodels.formula.api"` succeeds and
  `uv run pytest` passes; note the files and megabytes statsmodels and patsy add, for the PR.

## 2. Estimates template (sidecar)

- [x] 2.1 Add an optional `internal` field to `Template` (`templates.py`), leave internal
  templates out of `templates_text()` and treat them as unknown in *Plot*'s template check, and
  add `chart_templates/estimates.json` (slots `category` and `value`; a `ruleY` from
  `{value}_low` to `{value}_high` and a `dot` at `{value}`), marked internal. Verify: the
  template-format test still passes, and a pytest shows the template drawn from a frame of
  estimates and left out of `templates_text()`.

## 3. Compare Groups (sidecar)

- [x] 3.1 Add `adapters/data/groups.py`: per group the count and mean, and for each group but
  the reference the difference of means with a 95% bootstrap interval (2,000 resamples, fixed
  seed) and a Welch p-value; refuse more than 20 groups or a group with fewer than 2 values.
  Verify: pytest on two clearly different groups and one equal to the reference checks the
  order of the intervals, the reference choice and the refusals.
- [x] 3.2 Add the plan (`value`, `groups`, `reference`), the shared role check (a missing or
  ill-typed column fails naming it and its role), the adapter `data-compare-groups` and the
  reply: the largest difference in the text, the closing association sentence, the groups
  table, the estimates chart and a box plot. Verify: pytest for the role check passes.

## 4. Find Drivers (sidecar)

- [x] 4.1 Add `adapters/data/drivers.py`: OLS through a statsmodels formula with `Q()` quoting
  and `C()` for text and boolean drivers; per term the coefficient, 95% interval and p-value;
  per driver the largest VIF of its terms; R² and rows used; refuse more terms than complete
  rows. Verify: pytest on generated data with a known slope, a text driver and two collinear
  drivers checks the slope's interval, the dummy terms and the high VIFs.
- [x] 4.2 Add the plan (`outcome`, `drivers`), the adapter `data-drivers` and the reply: terms
  whose interval excludes zero, drivers with a VIF above 5, rows left out, the terms table and
  the estimates chart. Verify: `cd sidecar && uv run pytest` passes.

## 5. Check Confounders (sidecar)

- [x] 5.1 Add `adapters/data/confounders.py`: the focus's coefficient alone and with the
  controls, and within each subgroup with at least 10 rows (at most 10), each with its interval
  and rows used, and the change in percent. Verify: pytest on generated data where a control
  explains the focus's effect checks that the estimate shrinks and the subgroup rows.
- [x] 5.2 Add the plan (`outcome`, `focus`, `controls`, `subgroups`), the adapter
  `data-confounders` and the reply: held, shrank, grew or changed sign (held below 10%), the
  estimates table and chart. Verify: `cd sidecar && uv run pytest` passes.

## 6. Analyze Trends (sidecar)

- [x] 6.1 Add `adapters/data/trends.py`: the OLS slope of the value over time (dates as
  fractional years) with its interval and p-value, overall and per group (at most 10, at least
  10 rows each), and, with a change date, the means before and after and their difference with
  a bootstrap interval and Welch p-value. Verify: pytest on a series rising one unit a year
  with a step at a date checks the slope and the before/after difference.
- [x] 6.2 Add the plan (`value`, `time`, `group`, `change_date`), the adapter `data-trends` and
  the reply: the trends table, the before/after table when there is one, and a line chart of the
  mean over time per group. Verify: `cd sidecar && uv run pytest` passes.

## 7. Library and icons

- [x] 7.1 Add `chart-bar-big`, `chart-network`, `shield-question` and `chart-spline` to
  `TRAIT_ICONS` in `src/lib/traitIcons.ts`. Verify: `npx tsc --noEmit` passes.
- [x] 7.2 In `src-tauri/library/builtin.json`, add the four Traits (adapters, icons, colours,
  instructions that fill the roles from the message and the earlier outputs) and the
  Diagnostic Analytics Mini-Me in the Data group with its look and Workflow (the three
  conditions and the written-answer approval, wording from design.md). Verify:
  `cd src-tauri && cargo test` passes.

## 8. In the app

- [x] 8.1 With the app running (the user runs `npm run tauri dev`), on the EDA test table:
  "@Diagnostic Analytics does yield_t_ha differ between sites?" runs *Compare Groups* without
  asking; "@Diagnostic Analytics why is yield low?" asks questions, and after an answer naming
  the outcome, drivers and a control runs *Find Drivers* then *Check Confounders*; a question
  about change over time runs *Analyze Trends*.

## Workflow follow-up

- Add a "New" line to `CHANGELOG.md` for the Diagnostic Analytics Mini-Me.
- Archive the change with `/opsx:archive`, syncing its delta specs.
- Ask the user, then open the PR from `feat/diagnostic-traits` into `dev` (after #212 is merged).
