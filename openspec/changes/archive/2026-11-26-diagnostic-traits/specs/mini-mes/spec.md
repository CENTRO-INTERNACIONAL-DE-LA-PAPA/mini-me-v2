# Spec Delta

## ADDED Requirements

### Requirement: Diagnostic Analytics asks, then picks its method
The Diagnostic Analytics Mini-Me's Workflow SHALL run three conditions in order: "clear"
(no Steps) or "unclear" (a written-answer approval whose questions the AI model writes); then
"groups" (*Compare Groups*), "drivers" (*Find Drivers*, then *Check Confounders*) or "trend"
(*Analyze Trends*); then "chart" (*Plot*) or "no chart" (no Steps), as for Exploratory Data
Analysis.

#### Scenario: A clear groups question
- **WHEN** the user sends "@Diagnostic Analytics #field-trial.csv does yield_t_ha differ
  between sites?"
- **THEN** the first condition answers "clear", the second "groups", *Compare Groups* runs, and
  no approval is shown

#### Scenario: An unclear question
- **WHEN** the user sends "@Diagnostic Analytics why is yield low? #field-trial.csv"
- **THEN** the first condition answers "unclear", and the reply waits at an approval with
  questions about the outcome and the possible drivers

#### Scenario: Drivers, then confounders
- **WHEN** the user's answer says "yield_t_ha; check rainfall_mm, with altitude_m as a control"
- **THEN** the second condition answers "drivers", and *Find Drivers* runs, then *Check
  Confounders* with `rainfall_mm` as its focus and `altitude_m` as a control

## MODIFIED Requirements

### Requirement: Trait library
The Rust core SHALL hold a shared Trait library. Each Trait definition SHALL have:
- an `id` (UUID, stable across installations);
- a `name` (imperative verb in Title Case) and a `description`;
- a `color`: one bright fill on which a black line glyph stays legible, as DESIGN.md
  describes for Trait icons;
- optionally an `icon`: the name of one of the UI's Trait icons;
- the `adapter` that runs it;
- its `instructions` (text, or none for adapters that take none).

A definition lists no tools and no Interactive Component kinds: a prompt-based Trait's model is
offered every tool, and an adapter that runs fixed code uses the tools its code calls.

The library holds built-in Traits, which are read-only, and user-made Traits, which the user
creates, edits and deletes as the Library editors describe. The built-in Traits are
*Summarize*, *Assist*, *Find Papers*, *Theorize*, *Scout*, *Refute*, *Plan*, *Wonder*,
*Experiment*, *Profile Data*, *Validate Data*, *Clean Data*, *Join Data*, *Plot*, *Describe
Variables*, *Find Correlations*, *Detect Outliers*, *Find Clusters*, *Compare Groups*, *Find
Drivers*, *Check Confounders* and *Analyze Trends*, and the placeholder Traits.

#### Scenario: Built-in Traits
- **WHEN** the app starts
- **THEN** the library contains *Summarize*, *Assist*, *Scout*, *Refute*, *Plan*,
  *Wonder* and *Experiment* (adapter `prompt`), *Find Papers* (adapter
  `asta-paper-finder`), *Theorize* (adapter `asta-theorizer`), *Profile Data* (adapter
  `data-profile`), *Validate Data* (adapter `data-validate`), *Clean Data* (adapter
  `data-clean`), *Join Data* (adapter `data-join`), *Plot* (adapter `data-plot`), *Describe
  Variables* (adapter `data-describe-variables`), *Find Correlations* (adapter
  `data-correlations`), *Detect Outliers* (adapter `data-outliers`), *Find Clusters* (adapter
  `data-clusters`), *Compare Groups* (adapter `data-compare-groups`), *Find Drivers* (adapter
  `data-drivers`), *Check Confounders* (adapter `data-confounders`), *Analyze Trends* (adapter
  `data-trends`), and the placeholder Traits (adapter `echo`)

#### Scenario: Components of the built-in Traits
- **WHEN** the app starts
- **THEN** no built-in Trait definition holds a list of tools or component kinds

#### Scenario: User-made Traits join the library
- **WHEN** the app starts and `library.json` holds a valid Trait *Translate*
- **THEN** the library contains *Translate* next to the built-in Traits, marked as
  user-made

### Requirement: Predefined Mini-Mes
Mini-Me SHALL ship with eighteen Mini-Mes:
- **Scribe:** "Summarizes your messages and the files you reference"; one Step running
  *Summarize*.
- **Assistant:** "Answers general questions and requests that no other Mini-Me specializes
  in, and can save files and show tables"; one Step running *Assist*, whose instructions
  make it a general research assistant that uses its tools when the request needs them,
  reads referenced files when relevant and says when it does not know. Assistant also
  answers whenever routing has no confident choice.
- **Researcher:** "Finds research papers on a topic with Ai2's Paper Finder"; one Step
  running *Find Papers*.
- **Theorist:** "Builds scientific theories from the literature with Ai2's Theorizer"; one
  Step running *Theorize*.
- **Explorer:** "Suggests a range of directions worth exploring on a topic"; one Step
  running *Scout*.
- **Skeptic:** "Argues against a statement or claim to test how well it holds up"; one
  Step running *Refute*.
- **Planner:** "Plans a project as an architecture or an ordered list of steps"; one Step
  running *Plan*.
- **Inquirer:** "Asks questions that open up a topic further"; one Step running *Wonder*.
- **Experimenter:** "Designs experiments to test a hypothesis"; one Step running
  *Experiment*.
- **Profiler:** "Describes what is in a data table: its columns, types, missing values and
  duplicates"; one Step running *Profile Data*.
- **Validator:** "Checks a data table against rules and reports which checks fail"; one
  Step running *Validate Data*.
- **Curator:** "Cleans a data table and saves the result as a new file"; one Step running
  *Clean Data*.
- **Linker:** "Joins two data tables on their key columns"; one Step running *Join Data*.
- **Plotter:** "Draws charts of a data table"; one Step running *Plot*.
- **CIP's Archivist:** "Finds datasets in CIP's Dataverse and downloads their files into the
  Project"; one Step running *Search CIP Dataverse*.
- **Investigator:** "Investigates a research question in several steps: explores it, plans,
  tests the plan against criticism and, if you approve, designs an experiment"; the
  the Workflow described by the Investigator requirements below.
- **Exploratory Data Analysis:** "Explores a data table: describes its columns, finds
  correlations and outliers, and groups similar rows when that helps"; the Workflow
  described by the Exploratory Data Analysis requirement below.
- **Diagnostic Analytics:** "Looks into why something happened in a data table: compares
  groups, finds what goes with an outcome and checks for confounders, or follows a trend over
  time"; the Workflow described by the Diagnostic Analytics requirement below.

Their colours follow DESIGN.md's Mini-Me colour family, and no two share a colour.

#### Scenario: Mini-Mes available
- **WHEN** the user types `@` in the composer
- **THEN** Scribe, Assistant, Researcher, Theorist, Explorer, Skeptic, Planner, Inquirer,
  Experimenter, Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist, Investigator,
  Exploratory Data Analysis and Diagnostic Analytics are offered

#### Scenario: General question
- **WHEN** the user sends "@Assistant what is late blight?"
- **THEN** Assistant answers with an explanation from the AI model chosen in Settings

#### Scenario: Routed to a new Mini-Me
- **WHEN** the user sends "Design an experiment to test whether early planting reduces late
  blight" without a mention, and routing picks Experimenter
- **THEN** Experimenter answers by running *Experiment*

#### Scenario: Routed to Plotter
- **WHEN** the user sends "#field-trial.csv plot yield over the season" without a mention,
  and routing picks Plotter
- **THEN** Plotter answers by running *Plot*

### Requirement: Predefined Mini-Mes have groups
The predefined Mini-Mes SHALL have these groups: Thinking for Assistant, Scribe, Explorer,
Skeptic, Planner, Inquirer, Experimenter and Investigator; Literature for Researcher and
Theorist; Data for Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist, Exploratory Data
Analysis and Diagnostic Analytics.

#### Scenario: Data Mini-Mes
- **WHEN** the user types "@" alone
- **THEN** Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist, Exploratory Data
  Analysis and Diagnostic Analytics are listed under Data
