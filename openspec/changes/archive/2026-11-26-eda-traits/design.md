# Design

## Context

See proposal.md for why. The existing data Traits share one shape (`sidecar/src/mini_me_sidecar/adapters/data/`):

- an adapter class in `__init__.py` calls a reply function in `replies.py`;
- `read_tables` reads the referenced tables through `asset.read`, so Project-folder confinement holds;
- `choose()` asks the model for a pydantic plan built from `describe()` (columns, statistics, top values, never rows), and `fit_plan` drops malformed entries;
- the computation runs in a worker process (`WORKERS.run`) that the sidecar can end on cancel;
- results go out through `show_frame` (a `table` component, kept as a hidden CSV) and `show_chart`, and new files through `save_file`.

*Plot* turns a template choice (`ChartChoice`) into a chart (`fill_template`, then `build_chart`), and `build_chart` takes any pandas frame.

A Workflow is checked by the Rust core (`src-tauri/src/library.rs`, `branch_problems`) and compiled to a graph by the sidecar (`workflow/graph.py`). Both assume every branch has Steps. Only the last Trait Step that ran shows its text and components in the reply; the earlier Steps' are in the Steps card (`componentPlaces` in `WorkflowProgress.tsx`).

The sidecar ships pandas, numpy and pointblank, and no scientific library beyond them. The bundle already holds about 17,600 files (#197).

## Goals / Non-Goals

**Goals:**
- The four Traits follow the existing data Trait shape, so they need no new protocol event, tool or UI.
- The text each Step writes is enough for the Workflow's conditions to decide, and holds no cell values.

**Non-Goals:**
- Changing how a multi-Step reply is shown (#70).
- Changing *Profile Data* or *Plot*.

## Decisions

### Settled with the user

1. **One Mini-Me that runs its Traits as Steps.** The Exploratory Data Analysis Mini-Me runs *Profile Data*, *Describe Variables*, *Find Correlations* and *Detect Outliers*, then *Find Clusters* if a condition says clustering is worthwhile, then *Plot* if a condition says the message asks for another chart. A condition Step that picks one Trait per message, and single-Trait Mini-Mes, were considered. Single-Trait Mini-Mes can come later.
2. **The model chooses columns and options.** Each Trait takes the columns and options the message asks for, or every fitting column when it names none, as *Validate Data* and *Plot* do. Without an AI model a Trait fails; the Mini-Me's conditions need one anyway. Running every Trait without a model, and doing both, were considered.
3. **Only *Find Clusters* saves a visible file**, `<name>-clusters.csv`, so later Mini-Mes can use the cluster column. *Detect Outliers* shows its flagged rows, kept as a hidden results file like every shown table.
4. **A branch may be empty**, in a condition or a parallel Step, so the conditions can skip a Step. A placeholder Trait in the empty branch, Traits that skip themselves, and allowing empty branches only in conditions were considered.
5. **The v1 name**, Exploratory Data Analysis.

### Following existing patterns

6. **One module per Trait** under `adapters/data/` (`variables.py`, `correlations.py`, `outliers.py`, `clusters.py`), each with a pure function the worker runs and a pydantic plan schema next to the existing plans in `catalogue.py`. Adapters in `__init__.py`, reply functions in `replies.py`.
7. **Charts come from the built-in templates.** Each Trait builds a `ChartChoice` in code (for example the histogram template with `x` filled) and draws it with `fill_template` and `build_chart`, so missing values, sampling and the size limit behave as in *Plot*. *Find Clusters* draws from a frame of `pc1`, `pc2` and `cluster`, with the saved clusters file as its source.
8. **Step text holds counts, names and statistics, never cell values.** Conditions and later Steps' models read it. Values such as top categories or flagged rows go only into components.
9. **Empty branches:**
   - Rust: `branch_problems` no longer refuses a branch with no Steps.
   - Sidecar: `_condition` sends an empty branch's label straight to the condition's end node, and `close` already records no output when the branch wrote none. `_parallel` links an empty branch's start straight to its branch end, and `parallel_output` already skips branches without output.
   - The Workflow editor already draws empty branches and needs no change.

## Risks / Trade-offs

- **[Bundle size]** scikit-learn brings scipy and its native libraries, adding many files and megabytes to an install that #197 already finds slow. → Add scikit-learn alone (decision 10), and record the file and size increase in the PR so #197 can account for it.
- **[Reply shows only the last Step]** The profile, distributions and correlations sit in the Steps card until #70. → Accepted for this change; the condition outcomes and every Step's components stay reachable from the card.
- **[Conditions misjudge]** The model may skip clustering on a table where it would help, or draw an extra chart nobody asked for. → *Describe Variables* states how many columns of each type it described, and *Profile Data* states the row count, so the clustering question has the facts it needs. *Find Clusters* and *Plot* stay usable on their own through their own Mini-Mes later.
- **[Slow on large tables]** The Isolation Forest, silhouette scores and HDBSCAN grow with the rows. → Silhouette is scored on a sample of at most 5,000 rows, HDBSCAN is not used above 20,000 rows, and everything runs in the cancellable worker.
- **[Fallback table]** A run whose message references no table uses the newest table of the Conversation. After *Find Clusters* saves `<name>-clusters.csv`, a later *Plot* Step in the same run would draw from it. → Accepted: it holds the same rows plus `cluster`.

### Settled after drafting

10. **Libraries.** Only scikit-learn is added; it installs scipy, which gives the correlation p-values. statsmodels waits for `diagnostic-traits`, where regression needs it, to keep the bundle smaller (#197).
11. **Defaults**, following v1's scripts and scikit-learn's own:
    - Pearson correlation;
    - up to 8 charts per Trait;
    - text and boolean columns charted up to 30 distinct values;
    - outlier bounds at 1.5 interquartile ranges, or 3 for extreme;
    - Isolation Forest with scikit-learn's automatic contamination;
    - k-means tries 2 to 8 clusters, kept by silhouette score on at most 5,000 rows;
    - HDBSCAN up to 20,000 rows.
12. **Adapter IDs:** `data-describe-variables`, `data-correlations`, `data-outliers`, `data-clusters`.
13. **Trait icons and colours.** The icons are four lucide icons added to the Trait icon set (`src/lib/traitIcons.ts`): `chart-column` for *Describe Variables*, `chart-scatter` for *Find Correlations*, `radar` for *Detect Outliers*, `group` for *Find Clusters*. The colours use hues no Trait has, at the other data Traits' lightness and chroma: `oklch(0.8 0.12 75)`, `oklch(0.78 0.1 250)`, `oklch(0.76 0.14 5)`, `oklch(0.8 0.11 130)`.
14. **The Mini-Me's look and words:**
    - colour: an OKLCH hue of about 135, a green between Experimenter's and Planner's, with tint, solid and ink at DESIGN.md's lightness and chroma, its ink checked at 4.5:1 or more on wash and tint;
    - avatar: base `huayro`, eyes `starry-eyed`, mouth `open`, accessory `headlamp`;
    - description: "Explores a data table: describes its columns, finds correlations and outliers, and groups similar rows when that helps";
    - condition questions and labels:
      - "Do the earlier Steps show at least two number columns and enough complete rows to find groups worth reporting?" (`cluster` / `skip`);
      - "Does the user's message ask for a chart that the earlier Steps did not draw?" (`chart` / `no chart`).
