# Spec Delta

## MODIFIED Requirements

### Requirement: Mini-Me definitions
Each Mini-Me SHALL have:
- an `id` (UUID, stable across installations);
- a `name` and a `description`;
- colours `tint`, `solid` and `ink`;
- exactly one Workflow, a list of Steps as Workflows define them.

A Mini-Me's Traits are the Traits its Trait Steps reference. Mini-Mes are read-only in this
version.

#### Scenario: One-Step Workflow
- **WHEN** a Mini-Me whose Workflow has one Trait Step answers a message
- **THEN** that Step's Trait is the one called

#### Scenario: Multi-Step Workflow
- **WHEN** Investigator answers a message
- **THEN** its reply is produced by running each Step of its Workflow

### Requirement: Predefined Mini-Mes
Mini-Me SHALL ship with fourteen Mini-Mes:
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
- **Investigator:** "Investigates a research question in several steps: explores it, plans,
  tests the plan against criticism and, if you approve, designs an experiment"; the
  the Workflow described by the Investigator requirements below.

Their colours follow DESIGN.md's Mini-Me colour family, and no two share a colour.

#### Scenario: Mini-Mes available
- **WHEN** the user types `@` in the composer
- **THEN** Scribe, Assistant, Researcher, Theorist, Explorer, Skeptic, Planner, Inquirer,
  Experimenter, Profiler, Validator, Curator, Linker and Investigator are offered

#### Scenario: General question
- **WHEN** the user sends "@Assistant what is late blight?"
- **THEN** Assistant answers with an explanation from the AI model chosen in Settings

#### Scenario: Routed to a new Mini-Me
- **WHEN** the user sends "Design an experiment to test whether early planting reduces late
  blight" without a mention, and routing picks Experimenter
- **THEN** Experimenter answers by running *Experiment*

## ADDED Requirements

### Requirement: Investigator explores, then plans
Investigator's Workflow SHALL start with a parallel Step whose branches are "Directions",
running *Scout*, and "Questions", running *Wonder*, followed by a *Plan* Step.

#### Scenario: Opening a question
- **WHEN** the user sends "@Investigator does early planting reduce late blight?"
- **THEN** *Scout* and *Wonder* run at the same time, then *Plan* runs with both of their
  outputs

### Requirement: Investigator tests its plan against criticism
After its first *Plan* Step, Investigator's Workflow SHALL run a loop of *Refute* then
*Plan*, at most 2 times, whose question asks whether the latest critique found a serious
flaw that the revised plan may still have.

#### Scenario: Sound plan
- **WHEN** the model answers `stop` after the first run of the loop
- **THEN** *Refute* and *Plan* ran once each inside the loop

### Requirement: Investigator designs an experiment only if approved
Investigator's Workflow SHALL end with a condition asking whether the plan rests on a
hypothesis that an experiment could test. Its "testable" branch runs an approval, "Design an
experiment to test this plan's hypothesis?", then *Experiment*; its "not testable" branch
runs *Wonder*.

#### Scenario: Testable plan, approved
- **WHEN** the model finds the plan testable and the user approves
- **THEN** the reply's text is *Experiment*'s design, and its progress card lists every Step
  that ran

#### Scenario: Not testable
- **WHEN** the model finds the plan not testable
- **THEN** no approval is asked, and the reply's text is the questions *Wonder* wrote
