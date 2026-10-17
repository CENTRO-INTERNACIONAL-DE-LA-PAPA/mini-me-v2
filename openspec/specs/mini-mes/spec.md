# mini-mes Specification

## Purpose

Defines the shared Trait library and the Mini-Mes built from it: what a Trait and a Mini-Me
definition hold, which ones Mini-Me ships with, and how the UI lists and shows them.

## Requirements

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
*Validate Data*, *Clean Data* and *Join Data*, and the placeholder Traits.

#### Scenario: Built-in Traits
- **WHEN** the app starts
- **THEN** the library contains *Summarize*, *Assist*, *Scout*, *Refute*, *Plan*,
  *Wonder* and *Experiment* (adapter `prompt`), *Find Papers* (adapter
  `asta-paper-finder`), *Theorize* (adapter `asta-theorizer`), *Profile Data* (adapter
  `data-profile`), *Validate Data* (adapter `data-validate`), *Clean Data* (adapter
  `data-clean`), *Join Data* (adapter `data-join`), and the placeholder Traits (adapter
  `echo`)

#### Scenario: Components of the built-in Traits
- **WHEN** the app starts
- **THEN** *Find Papers* lists `paper-sources`, *Theorize* lists `theories`, *Profile
  Data*, *Validate Data*, *Clean Data* and *Join Data* list `table`, and every other Trait
  lists none

### Requirement: Mini-Me definitions
Each Mini-Me SHALL have:
- an `id` (UUID, stable across installations);
- a `name` and a `description`;
- colours `tint`, `solid` and `ink`;
- exactly one Workflow.

In this version every Workflow has exactly one Trait Step, which references a Trait in the
library by ID. Mini-Mes are read-only in this version.

#### Scenario: One-Step Workflow
- **WHEN** a Mini-Me answers a message
- **THEN** its single Step's Trait is the one called

### Requirement: Predefined Mini-Mes
Mini-Me SHALL ship with thirteen Mini-Mes:
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

Their colours follow DESIGN.md's Mini-Me colour family, and no two share a colour.

#### Scenario: Mini-Mes available
- **WHEN** the user types `@` in the composer
- **THEN** Scribe, Assistant, Researcher, Theorist, Explorer, Skeptic, Planner, Inquirer,
  Experimenter, Profiler, Validator, Curator and Linker are offered

#### Scenario: General question
- **WHEN** the user sends "@Assistant what is late blight?"
- **THEN** Assistant answers with an explanation from the AI model chosen in Settings

#### Scenario: Routed to a new Mini-Me
- **WHEN** the user sends "Design an experiment to test whether early planting reduces late
  blight" without a mention, and routing picks Experimenter
- **THEN** Experimenter answers by running *Experiment*

### Requirement: A Mini-Me is shown by name and colour
The UI SHALL get the list of Mini-Mes (ID, name, description, colours) from the Rust core.
It SHALL show each reply authored by a Mini-Me with that Mini-Me's name and a mark in its
`solid` colour. It SHALL show each `@` mention as a chip in the Mini-Me's `tint` with
`ink` text. A reply whose Mini-Me is unknown SHALL show "Mini-Me" with a neutral mark.

#### Scenario: Reply header
- **WHEN** Scribe answers
- **THEN** the reply's header reads "Scribe" next to a mark in Scribe's solid colour

#### Scenario: Unknown Mini-Me
- **WHEN** a Conversation holds a reply from a Mini-Me that no longer exists
- **THEN** the reply is shown as "Mini-Me" with a neutral mark and its text intact

### Requirement: Placeholder Traits
The Trait library SHALL contain placeholder Traits for Traits that later changes will
build: *Document*, *Explore Dataverse*, *Code*, *Collect Data*, *Model*, *Predict* and
*Index Sources*. Each runs on the `echo` adapter, has no instructions and lists no
components. No predefined Mini-Me's Workflow SHALL reference a placeholder Trait.

#### Scenario: Placeholders are in the library
- **WHEN** the app starts
- **THEN** the library contains *Document*, *Explore Dataverse*, *Code*, *Collect Data*,
  *Model*, *Predict* and *Index Sources*, each with adapter `echo`

#### Scenario: Placeholders can't be invoked
- **WHEN** the user types `@` in the composer, or sends a message without a mention
- **THEN** no offered or routed Mini-Me runs a placeholder Trait

### Requirement: Built Traits keep their placeholder ID
When a change builds a Trait that is a placeholder, it SHALL keep the placeholder's ID and
replace its adapter, so anything that references the Trait keeps working.

#### Scenario: Building a placeholder
- **WHEN** a later change builds *Document*
- **THEN** *Document* has the same ID as its placeholder and no longer uses `echo`
