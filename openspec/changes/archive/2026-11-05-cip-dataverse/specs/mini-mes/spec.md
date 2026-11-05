# Spec Delta

## MODIFIED Requirements

### Requirement: Predefined Mini-Mes
Mini-Me SHALL ship with sixteen Mini-Mes:
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

Their colours follow DESIGN.md's Mini-Me colour family, and no two share a colour.

#### Scenario: Mini-Mes available
- **WHEN** the user types `@` in the composer
- **THEN** Scribe, Assistant, Researcher, Theorist, Explorer, Skeptic, Planner, Inquirer,
  Experimenter, Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist and Investigator
  are offered

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

### Requirement: Placeholder Traits
The Trait library SHALL contain placeholder Traits for Traits that later changes will
build: *Code*, *Collect Data*, *Model*, *Predict* and *Index Sources*.
Documents are written with the write-a-document tool, so there is no *Document* Trait. Each runs on the `echo` adapter and has no instructions. No predefined
Mini-Me's Workflow SHALL reference a placeholder Trait.

#### Scenario: Placeholders are in the library
- **WHEN** the app starts
- **THEN** the library contains *Code*, *Collect Data*, *Model*, *Predict* and *Index Sources*,
  each with adapter `echo`, and no *Document*

#### Scenario: Placeholders can't be invoked
- **WHEN** the user types `@` in the composer, or sends a message without a mention
- **THEN** no offered or routed Mini-Me runs a placeholder Trait

### Requirement: Predefined Mini-Mes have groups
The predefined Mini-Mes SHALL have these groups: Thinking for Assistant, Scribe, Explorer,
Skeptic, Planner, Inquirer, Experimenter and Investigator; Literature for Researcher and
Theorist; Data for Profiler, Validator, Curator, Linker, Plotter and CIP's Archivist.

#### Scenario: Data Mini-Mes
- **WHEN** the user types "@" alone
- **THEN** Profiler, Validator, Curator, Linker, Plotter and CIP's Archivist are listed under
  Data
