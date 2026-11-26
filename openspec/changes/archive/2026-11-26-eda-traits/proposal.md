# Proposal

## Why

Mini-Me v1 had an Exploratory Data Analysis specialist that answered "what happened in this
data?" by writing and running its own code. v2 has the first data Traits (*Profile Data*,
*Validate Data*, *Clean Data*, *Join Data*, *Plot*) but nothing that explores a table: its
distributions, how its columns relate, its unusual values and its groups. This change brings
v1's Exploratory Data Analysis to v2 as fixed tools in the sidecar, where the AI model only
chooses columns and options and the sidecar computes every number. It is the first half of
issue #62; Diagnostic Analytics follows in a separate change.

## What Changes

- Four new built-in data Traits, each a fixed tool in the sidecar:
  - *Describe Variables*: per-column summaries (numbers, categories, dates) and their
    distribution charts.
  - *Find Correlations*: pairwise correlations of number columns, a correlation heatmap and
    scatter charts of the strongest pairs.
  - *Detect Outliers*: unusual values per column and unusual rows across columns.
  - *Find Clusters*: groups of similar rows, shown on a two-component PCA scatter, and saved
    as a new file with a cluster column.
- A new predefined Mini-Me, **Exploratory Data Analysis**, in the Data group. Its Workflow runs
  *Profile Data*, *Describe Variables*, *Find Correlations* and *Detect Outliers* in order,
  then *Find Clusters* if a condition finds clustering worthwhile, then *Plot* if a condition
  finds that the message asks for a chart the earlier Steps did not draw.
- A branch of a condition or parallel Step may have no Steps, so a condition can skip a
  Step.
- The sidecar ships scikit-learn, and with it scipy, for the new Traits' computations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-traits`: adds the *Describe Variables*, *Find Correlations*, *Detect Outliers* and
  *Find Clusters* Traits, what the model chooses for each, and what each replies with and saves.
- `mini-mes`: adds the four Traits to the built-in library, and the Exploratory Data Analysis
  Mini-Me to the predefined Mini-Mes and the Data group.
- `workflows`: a condition's or parallel Step's branch may be empty; the library check and
  Step outputs say how.

## Out of scope

- Diagnostic Analytics and its Traits (*Compare Groups*, *Find Drivers*, *Check Confounders*,
  *Analyze Trends*): the `diagnostic-traits` change.
- Predictive Analytics, *Model* and *Predict* (#209, after the sandbox #96).
- Single-Trait Mini-Mes for the four new Traits.
- Showing earlier Steps' components in the final reply, and a written summary of the run
  (#70). Until then, the Exploratory Data Analysis reply shows the last Step that ran, and
  the earlier Steps' tables and charts are in its Steps card.
- Jev deciding Workflow conditions (#29); conditions ask the AI model, as today.
- Correlations between text columns, UMAP, and code written by the AI model.
- statsmodels and dabest, which Diagnostic Analytics may need.

## Impact

- **Sidecar:** four adapters and their computations under `adapters/data/`, with pytest tests;
  `scikit-learn` added to `sidecar/pyproject.toml`, which brings `scipy` and adds files and
  megabytes to the bundle (see #197).
- **Rust core:** the Workflow check in `src-tauri/src/library.rs` accepts an empty branch;
  `src-tauri/library/builtin.json` gains four Traits and one Mini-Me.
- **Sidecar Workflows:** `workflow/graph.py` compiles an empty branch.
- **UI:** none beyond what the library already shows; the Workflow editor already draws
  empty branches.
- **No new external service, credential or cost.** Conditions make up to two model calls per
  Exploratory Data Analysis reply on the user's own provider, and the four Traits one each.
- **No new protocol events.**
