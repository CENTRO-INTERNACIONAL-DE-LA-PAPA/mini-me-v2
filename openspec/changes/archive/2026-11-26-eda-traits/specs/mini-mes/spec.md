# Spec Delta

## ADDED Requirements

### Requirement: Exploratory Data Analysis explores a table in Steps
The Exploratory Data Analysis Mini-Me's Workflow SHALL run *Profile Data*, *Describe
Variables*, *Find Correlations* and *Detect Outliers*, in that order, then a condition asking
whether clustering is worthwhile for the table, whose "cluster" branch runs *Find Clusters* and
whose "skip" branch has no Steps, then a condition asking whether the message asks for a chart
the earlier Steps did not draw, whose "chart" branch runs *Plot* and whose "no chart" branch
has no Steps.

#### Scenario: Exploring a table
- **WHEN** the user sends "@Exploratory Data Analysis explore #field-trial.csv" for a table of
  240 rows with five number columns
- **THEN** the reply's progress card shows *Profile Data*, *Describe Variables*, *Find
  Correlations* and *Detect Outliers* done, the first condition answered "cluster", *Find
  Clusters* done, and the second condition answered "no chart"

#### Scenario: Too little to cluster
- **WHEN** the table has one number column
- **THEN** the first condition answers "skip", and *Find Clusters* does not run

#### Scenario: Extra chart asked for
- **WHEN** the message is "explore #field-trial.csv and show mean yield by site"
- **THEN** the second condition answers "chart", and *Plot* draws mean yield by site

#### Scenario: Every Step reads the same table
- **WHEN** the message references `field-trial.csv`
- **THEN** every Step of the run reads `field-trial.csv`

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
Variables*, *Find Correlations*, *Detect Outliers* and *Find Clusters*, and the placeholder
Traits.

#### Scenario: Built-in Traits
- **WHEN** the app starts
- **THEN** the library contains *Summarize*, *Assist*, *Scout*, *Refute*, *Plan*,
  *Wonder* and *Experiment* (adapter `prompt`), *Find Papers* (adapter
  `asta-paper-finder`), *Theorize* (adapter `asta-theorizer`), *Profile Data* (adapter
  `data-profile`), *Validate Data* (adapter `data-validate`), *Clean Data* (adapter
  `data-clean`), *Join Data* (adapter `data-join`), *Plot* (adapter `data-plot`), *Describe
  Variables* (adapter `data-describe-variables`), *Find Correlations* (adapter
  `data-correlations`), *Detect Outliers* (adapter `data-outliers`), *Find Clusters* (adapter
  `data-clusters`), and the placeholder Traits (adapter `echo`)

#### Scenario: Components of the built-in Traits
- **WHEN** the app starts
- **THEN** no built-in Trait definition holds a list of tools or component kinds

#### Scenario: User-made Traits join the library
- **WHEN** the app starts and `library.json` holds a valid Trait *Translate*
- **THEN** the library contains *Translate* next to the built-in Traits, marked as
  user-made

### Requirement: Predefined Mini-Mes
Mini-Me SHALL ship with seventeen Mini-Mes:
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

Their colours follow DESIGN.md's Mini-Me colour family, and no two share a colour.

#### Scenario: Mini-Mes available
- **WHEN** the user types `@` in the composer
- **THEN** Scribe, Assistant, Researcher, Theorist, Explorer, Skeptic, Planner, Inquirer,
  Experimenter, Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist, Investigator
  and Exploratory Data Analysis are offered

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
Theorist; Data for Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist and Exploratory Data
Analysis.

#### Scenario: Data Mini-Mes
- **WHEN** the user types "@" alone
- **THEN** Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist and Exploratory Data
  Analysis are listed under Data
