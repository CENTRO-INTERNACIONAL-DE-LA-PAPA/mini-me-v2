# Proposal

## Why

Mini-Me v1 had a Diagnostic Analytics specialist that answered "why did this happen in my
data?": it compared groups, estimated which variables go with an outcome, checked whether a
driver's effect holds once other variables are accounted for, and looked at change over time.
Before running anything it asked the researcher for the outcome, the candidate drivers, the
confounders and whether they wanted an association or a cause. v2 can now ask that through an
approval with a written answer (`ask-step`). This change brings Diagnostic Analytics to v2 as
fixed tools in the sidecar, the second half of issue #62, after Exploratory Data Analysis.

## What Changes

- Four new built-in data Traits, each a fixed tool in the sidecar:
  - *Compare Groups*: how a number column differs between groups, as differences from a
    reference group with confidence intervals, with an estimation chart and a box plot.
  - *Find Drivers*: a regression of an outcome on candidate drivers: coefficients with
    confidence intervals and p-values, collinearity (VIF), and a coefficient chart.
  - *Check Confounders*: one driver's estimate without and with control variables, and within
    subgroups, showing how much it moves.
  - *Analyze Trends*: the trend of a number column over time, and the change before and after
    a date.
- A new predefined Mini-Me, **Diagnostic Analytics**, in the Data group. Its Workflow:
  1. asks, through a written-answer approval whose questions the AI model writes, when the
     message leaves the outcome or its possible explanations unclear;
  2. picks the method from the question: *Compare Groups*, *Find Drivers* followed by *Check
     Confounders*, or *Analyze Trends*;
  3. runs *Plot* when the message asks for a chart the earlier Steps did not draw.
- The four Traits describe what they find as associations, never as causes.
- The sidecar ships statsmodels for regression.
- A chart template for estimates with their intervals, used by these Traits and not offered to
  *Plot*.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-traits`: the four Traits, what the model chooses for each and what each replies with,
  associative wording, and the estimates template.
- `mini-mes`: the four Traits in the built-in library, and the Diagnostic Analytics Mini-Me in
  the predefined Mini-Mes and the Data group.

## Out of scope

- Predictive Analytics (#209) and code written by the AI model.
- Causal methods (matching, instrumental variables, difference-in-differences), logistic or
  other non-linear regression, and dabest.
- Single-Trait Mini-Mes for the four Traits.
- Showing earlier Steps' components in the final reply (#70).

## Impact

- **Sidecar:** four computations and adapters under `adapters/data/`, with pytest tests;
  `statsmodels` added to `sidecar/pyproject.toml` (brings `patsy`), adding files to the bundle
  (#197); an `internal` flag on chart templates.
- **Rust core:** `src-tauri/library/builtin.json` gains four Traits and one Mini-Me.
- **UI:** four Trait icons.
- **No new external service, credential or cost.** A Diagnostic Analytics reply makes up to
  three condition calls, one questions call and one call per Trait on the user's own provider.
- **No new protocol events.**
