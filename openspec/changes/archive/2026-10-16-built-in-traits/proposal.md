# Proposal

## Why

The Trait library holds four Traits (*Summarize*, *Assist*, *Find Papers*, *Theorize*), so
researchers can't yet brainstorm directions, challenge a claim, plan a project, find open
questions or design an experiment. These five need only an AI model, the same `prompt`
adapter that *Summarize* and *Assist* use. Adding them now fills out the thinking part of
research. Registering the Traits that will come later gives every planned Trait a stable ID
before the Editors change starts building Workflows from them.

## What Changes

- **Five new prompt Traits**, one task each, run by the `prompt` adapter with their own
  instructions:
  - *Scout* suggests a range of directions to explore on a topic (not hypotheses).
  - *Refute* argues that a statement is wrong, using only the information it's given.
  - *Plan* lays out an architecture or an ordered sequence of steps for a project.
  - *Wonder* asks questions that open a topic up further.
  - *Experiment* designs an experiment to test a hypothesis.
- **Five new predefined Mini-Mes**, one per new Trait, each with a one-Step Workflow:
  **Explorer** (*Scout*), **Skeptic** (*Refute*), **Planner** (*Plan*), **Inquirer**
  (*Wonder*) and **Experimenter** (*Experiment*). Like every Mini-Me, they can be
  @-mentioned and picked by routing.
- **Placeholder Traits:** *Document*, *Explore Dataverse*, *Code*, *Collect Data*,
  *Model*, *Predict* and *Index Sources* join the library with stable IDs and run on the
  `echo` adapter. No Mini-Me uses them, so they can't be @-mentioned or picked by routing,
  and nobody gets an echoed reply. Each is replaced by its real adapter in the change that
  builds it.
- **Trait colours follow DESIGN.md:** every Trait, the four existing ones included, gets a
  bright fill on which a black glyph stays legible, replacing the mid-tone solids.
- **Replies start with the answer:** the `prompt` adapter's system prompt tells the model to
  start with its answer, without a title or introduction that restates the request. This
  holds for every prompt Trait, *Summarize* and *Assist* included.
- **README:** the Traits section says its tables show some of the built-in Traits, and lists
  the Data Lifecycle Traits in place of the single *Analyze Data*. The Roadmap gains two data
  changes. "Asking a Mini-Me" drops its per-Mini-Me list, so new Mini-Mes need no README edit.

## Out of scope

- Data Traits: *Profile Data*, *Validate Data*, *Clean Data*, *Join Data* and the table
  Interactive Component (change #10); *Describe Variables*, *Find Correlations*, *Detect
  Outliers*, *Find Clusters*, *Compare Groups*, *Find Drivers*, *Check Confounders* and
  *Analyze Trends* (change #11).
- Real implementations of the placeholder Traits, code execution, and Dataverse.
- Interactive Components for the new Traits: they reply with text.
- Editors, multi-Step Workflows, and showing Traits in the UI.

No new external service, credential or cost: the new Traits use the AI provider and model
already chosen in Settings, like *Summarize*.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mini-mes`: the Trait library gains the five prompt Traits and the seven placeholder
  Traits, and a Trait's colour becomes a bright fill; Mini-Me ships with nine predefined
  Mini-Mes instead of four.
- `ai-providers`: the `prompt` adapter's system prompt adds the rule that replies start
  with the answer.
- `trait-execution`: requirements for the five new prompt Traits (like the existing
  *Summarize Trait*); the `echo` adapter now runs the placeholder Traits.

## Impact

- `src-tauri/library/builtin.json`: 12 Traits and 5 Mini-Mes added; the four existing
  Traits' colours changed.
- `src-tauri/src/library.rs`: tests updated for the new library contents.
- Routing: Jev chooses among nine Mini-Mes, so their descriptions must stay distinct.
- `sidecar/src/mini_me_sidecar/adapters/prompt.py`: one sentence added to the system
  prompt.
- No change to the protocol, storage or the UI code: the UI already lists Mini-Mes from the
  Rust core.
- `README.md`: Traits table, Roadmap and "Asking a Mini-Me".
