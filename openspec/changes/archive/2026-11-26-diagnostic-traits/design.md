# Design

## Context

See proposal.md for why. This change follows the shape the Exploratory Data Analysis Traits set (`sidecar/src/mini_me_sidecar/adapters/data/`):

- one module per Trait with a pure computation the worker runs (`variables.py`, `correlations.py`, `outliers.py`, `clusters.py`);
- plan schemas in `catalogue.py`, filled by `choose()`, which now also gives the model the earlier Steps' outputs (`ask-step`);
- reply functions in `replies.py` that draw their own charts through the templates (`_draw`, `_build`), often from a frame computed for the chart, as *Find Clusters* does with `pc1`, `pc2` and `cluster`.

The written-answer approval with model-written questions exists (`ask-step`). Its output reaches later Steps as "I asked: … The user answered: …". Empty condition branches exist (`eda-traits`).

## Goals / Non-Goals

**Goals:**
- Every number comes from scipy or statsmodels in the worker; the model only names columns, a reference group, a change date and the like.
- The replies speak of associations; the wording is in code, not left to the model.

**Non-Goals:**
- Choosing between statistical methods on the user's behalf beyond the Workflow's method condition.
- Causal estimation.

## Decisions

### Settled with the user

1. **One Mini-Me whose Workflow asks, then picks the method.** A fixed sequence of all four Traits was considered; it does not fit, because *Analyze Trends* needs a time column and *Compare Groups* a group column.
2. **Asking through a written-answer approval** whose questions the AI model writes, on the "unclear" branch of a first condition.
3. **Plot last, if asked**, through the same condition as Exploratory Data Analysis.
4. **statsmodels** for regression: OLS, confidence intervals and VIF. *Compare Groups* and *Analyze Trends* use scipy only.

### Approach

5. **Roles instead of column lists.** Each Trait's plan names columns by role: `value` and `groups` (and `reference`) for *Compare Groups*; `outcome` and `drivers` for *Find Drivers*; `outcome`, `focus`, `controls` and `subgroups` for *Check Confounders*; `value`, `time`, `group` and `change_date` for *Analyze Trends*. A role filled with a missing or ill-typed column fails the reply with the column and the role, because guessing another column would answer a different question. The EDA Traits' `pick_columns` stays for their optional column lists.
6. **Regression through formulas.** `statsmodels.formula.api.ols` with `Q("<name>")` quoting, so any column name works, and `C()` for text and boolean drivers, which gives one term per value but the first. VIF is computed on the design matrix without the intercept, one value per driver (the largest of its terms).
7. **Bootstrap intervals** with `scipy.stats.bootstrap` on the difference of means: 2,000 resamples, percentile method, a fixed seed, so a reply is the same each time. The Welch p-value comes from `scipy.stats.ttest_ind(equal_var=False)`.
8. **Trends** with statsmodels OLS of the value on time. Dates become fractional years, so the slope reads "per year"; number times keep their own unit.
9. **The estimates template** (`estimates.json`): slots `category` and `value`, a `ruleY` from `{value}_low` to `{value}_high` and a `dot` at `{value}`, one row per category. It is marked `"internal": true`, a new optional field on `Template`; `templates_text()` and *Plot*'s template check skip internal templates. The Traits build its frame (`term`, `estimate`, `estimate_low`, `estimate_high`).
10. **Associative wording** lives in the reply functions: verbs such as "differs", "goes with", "changed", and one closing sentence, "This shows an association, not a cause." The Traits' instructions add nothing about causes, so the model cannot override it.

## Risks / Trade-offs

- **[Bundle size]** statsmodels and patsy add files (#197). → Measure in task 2.1 and note in the PR, as for scikit-learn.
- **[Three model calls before any analysis]** Two conditions and maybe the questions call run before a Trait. → Accepted; #29 could move the conditions to Jev later.
- **[Wrong method picked]** A drivers question may be classified as groups, for example. → The condition's question names the three kinds with examples; the user can name the method in the message.
- **[Small samples]** Bootstrap intervals and regressions on a few rows are wide or unstable. → Minimums: 2 values per group, more complete rows than terms, 10 rows per subgroup; the reply states the rows used.

### Settled after drafting

11. **Defaults:** at most 20 groups with at least 2 values each, the reference being the largest group unless the message names one; 2,000 bootstrap resamples for 95% intervals; a VIF above 5 flagged; "held" when the focus's estimate moves less than 10%; at most 10 subgroups or trend groups, each with at least 10 rows.
12. **Adapter IDs:** `data-compare-groups`, `data-drivers`, `data-confounders`, `data-trends`.
13. **Trait icons:** lucide `chart-bar-big` (*Compare Groups*), `chart-network` (*Find Drivers*), `shield-question` (*Check Confounders*) and `chart-spline` (*Analyze Trends*), added to the Trait icon set; colours from hues no Trait uses, at the other data Traits' lightness and chroma.
14. **The Mini-Me's look:** a random unused colour hue and avatar, its ink checked at 4.5:1 or more on wash and tint.
15. **Workflow wording:**
    - "Is it clear?": "Do the user's message and the earlier outputs name the outcome and what might explain it clearly enough to analyse?" (`clear` / `unclear`).
    - The approval's instruction: "Ask only about what is unclear: which column is the outcome, which columns might explain it or which groups to compare, the time column and any date of a change, which columns to control for, and whether the user wants an association or a cause. Name the table's columns in the questions."
    - "What kind?": "Is this a question about a difference between groups, about what goes with an outcome, or about a change over time?" (`groups` / `drivers` / `trend`).
    - "Another chart?": the same question as Exploratory Data Analysis.
