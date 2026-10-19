# Spec Delta

## MODIFIED Requirements

### Requirement: Trait library
The Rust core SHALL hold a shared Trait library. Each Trait definition SHALL have:
- an `id` (UUID, stable across installations);
- a `name` (imperative verb in Title Case) and a `description`;
- a `color`: one bright fill on which a black line glyph stays legible, as DESIGN.md
  describes for Trait icons;
- the `adapter` that runs it;
- its `instructions` (text, or none for adapters that take none);
- its `components`: the Interactive Component kinds its answers may include, possibly
  empty. Only built-in Traits SHALL list any.

The library is read-only in this version. It contains *Summarize*, *Assist*, *Find
Papers*, *Theorize*, *Scout*, *Refute*, *Plan*, *Wonder*, *Experiment*, *Profile Data*,
*Validate Data*, *Clean Data*, *Join Data* and *Plot*, and the placeholder Traits.

#### Scenario: Built-in Traits
- **WHEN** the app starts
- **THEN** the library contains *Summarize*, *Assist*, *Scout*, *Refute*, *Plan*,
  *Wonder* and *Experiment* (adapter `prompt`), *Find Papers* (adapter
  `asta-paper-finder`), *Theorize* (adapter `asta-theorizer`), *Profile Data* (adapter
  `data-profile`), *Validate Data* (adapter `data-validate`), *Clean Data* (adapter
  `data-clean`), *Join Data* (adapter `data-join`), *Plot* (adapter `data-plot`), and the
  placeholder Traits (adapter `echo`)

#### Scenario: Components of the built-in Traits
- **WHEN** the app starts
- **THEN** *Find Papers* lists `paper-sources`, *Theorize* lists `theories`, *Profile
  Data*, *Validate Data*, *Clean Data* and *Join Data* list `table`, *Plot* lists `chart`,
  and every other Trait lists none

### Requirement: Predefined Mini-Mes
Mini-Me SHALL ship with fifteen Mini-Mes:
- **Scribe:** "Summarizes your messages and the files you reference"; one Step running
  *Summarize*.
- **Assistant:** "Answers general questions and requests that no other Mini-Me specializes
  in"; one Step running *Assist*, whose instructions make it a general research assistant
  that uses referenced files when relevant and says when it does not know.
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
- **Investigator:** "Investigates a research question in several steps: explores it, plans,
  tests the plan against criticism and, if you approve, designs an experiment"; the
  the Workflow described by the Investigator requirements below.

Their colours follow DESIGN.md's Mini-Me colour family, and no two share a colour.

#### Scenario: Mini-Mes available
- **WHEN** the user types `@` in the composer
- **THEN** Scribe, Assistant, Researcher, Theorist, Explorer, Skeptic, Planner, Inquirer,
  Experimenter, Profiler, Validator, Curator, Linker, Plotter and Investigator are offered

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
