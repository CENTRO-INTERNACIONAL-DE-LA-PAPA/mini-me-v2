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
- its `tools`: the tools it may use, possibly empty. A Trait whose adapter runs fixed code
  lists the tools that code uses; a prompt-based Trait lists the tools its model is offered
  besides the read tools, which every prompt-based Trait gets.

What a Trait can read, save or show comes only from its tools; a definition lists no
Interactive Component kinds. The library SHALL refuse to load with a tool name it does not
know, or with a prompt-based Trait listing a tool that has no form for models.

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
- **THEN** *Assist* lists `save_file` and `show_table`; *Find Papers* `show_papers`;
  *Theorize* `show_theories` and `save_file`; *Profile Data* `read_table` and `show_table`;
  *Validate Data*, *Clean Data* and *Join Data* `read_table`, `show_table` and `save_file`;
  *Plot* `read_table` and `show_chart`; and every other Trait lists none

### Requirement: Mini-Me definitions
Each Mini-Me SHALL have:
- an `id` (UUID, stable across installations);
- a `name` and a `description`;
- colours `tint`, `solid` and `ink`;
- a `group`, one of `thinking`, `literature` and `data`, which the `@` list shows it under;
- exactly one Workflow, a list of Steps as Workflows define them.

A Mini-Me's Traits are the Traits its Trait Steps reference. Mini-Mes are read-only in this
version.

#### Scenario: One-Step Workflow
- **WHEN** a Mini-Me whose Workflow has one Trait Step answers a message
- **THEN** that Step's Trait is the one called

#### Scenario: Multi-Step Workflow
- **WHEN** Investigator answers a message
- **THEN** its reply is produced by running each Step of its Workflow

#### Scenario: Unknown group
- **WHEN** the library names a Mini-Me with a `group` other than `thinking`, `literature` or
  `data`, or with none
- **THEN** the library fails to load, naming that Mini-Me

### Requirement: Predefined Mini-Mes
Mini-Me SHALL ship with fifteen Mini-Mes:
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

### Requirement: A Mini-Me is shown by name and colour
The UI SHALL get the list of Mini-Mes (ID, name, description, colours, group) from the Rust
core. It SHALL show each reply authored by a Mini-Me with that Mini-Me's name and a mark in
its `solid` colour. Wherever the UI names a Mini-Me inline (an `@` mention in a sent message
or a reply, an entry in the `@` list, a picked mention in the composer, a name in a reaction
tooltip), it SHALL show the Mini-Me's pill: its name on a rounded chip in its `tint` with
`ink` text. A reply whose Mini-Me is unknown SHALL show "Mini-Me" with a neutral mark, and an
inline name of an unknown Mini-Me SHALL show a neutral pill.

#### Scenario: Reply header
- **WHEN** Scribe answers
- **THEN** the reply's header reads "Scribe" next to a mark in Scribe's solid colour

#### Scenario: Unknown Mini-Me
- **WHEN** a Conversation holds a reply from a Mini-Me that no longer exists
- **THEN** the reply is shown as "Mini-Me" with a neutral mark and its text intact

#### Scenario: Mention in a sent message
- **WHEN** the user sends a message mentioning @Skeptic
- **THEN** "@Skeptic" is shown as Skeptic's pill

#### Scenario: Mention of a Mini-Me that no longer exists
- **WHEN** a sent message mentions a Mini-Me that no longer exists
- **THEN** its mention is shown as a neutral pill with the text it had

#### Scenario: Reaction tooltip
- **WHEN** the user points at a reaction Skeptic added
- **THEN** a tooltip names Skeptic as its pill

### Requirement: Placeholder Traits
The Trait library SHALL contain placeholder Traits for Traits that later changes will
build: *Document*, *Explore Dataverse*, *Code*, *Collect Data*, *Model*, *Predict* and
*Index Sources*. Each runs on the `echo` adapter and has no instructions. No predefined
Mini-Me's Workflow SHALL reference a placeholder Trait.

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

### Requirement: The @ list finds, describes and groups Mini-Mes
While the user types an `@` query in the composer, the UI SHALL list the Mini-Mes whose name
contains the query, ignoring case and accents. Each entry SHALL show the Mini-Me's pill and its
description. Entries SHALL be grouped under the headings Thinking, Literature and Data, in
that order, keeping the library's order within a group; a group with no matching Mini-Me SHALL
be left out.

#### Scenario: Narrowing the list
- **WHEN** the user types "@pro"
- **THEN** the list shows Profiler under Data, and no other Mini-Me

#### Scenario: Groups
- **WHEN** the user types "@" alone
- **THEN** the list shows every Mini-Me under its group's heading, with its description

### Requirement: Picking from the suggestion list with the keyboard
In the `@` and `#` suggestion lists, the up and down arrow keys SHALL move a highlight through
the entries, and Enter or Tab SHALL pick the highlighted entry. The first entry SHALL be
highlighted until the user moves the highlight, and again whenever the query changes.

#### Scenario: Picking with the keyboard
- **WHEN** the user types "@" and presses the down arrow, then Enter
- **THEN** the second entry is inserted as a mention

#### Scenario: No match
- **WHEN** the user types "@zzz"
- **THEN** no list is shown, and Enter sends the message as usual

### Requirement: Picked references are pills in the composer
After the user picks a Mini-Me or a file in the composer, the composer SHALL show that
reference as its pill (a Mini-Me) or file chip (a file) while the user keeps writing, before
the message is sent. Typing, selecting, undo, paste and input methods SHALL work as in a plain
text box.

#### Scenario: Picked mention
- **WHEN** the user types "@Sk" and picks Skeptic
- **THEN** "@Skeptic" is shown as Skeptic's pill in the composer before sending

### Requirement: Picked references act as one block
In the composer, a picked reference SHALL act as one block: the caret SHALL step over it, a
selection SHALL hold all of it or none of it, and Backspace or Delete next to it SHALL remove
all of it. The message SHALL be sent with the reference's label only, without the composer's
padding.

#### Scenario: Stepping over a picked mention
- **WHEN** the caret is right after a picked "@Skeptic" and the user presses the left arrow
- **THEN** the caret moves to just before "@"

#### Scenario: Deleting a picked mention
- **WHEN** the caret is right after a picked "@Skeptic" and the user presses Backspace
- **THEN** the whole mention is removed

### Requirement: Predefined Mini-Mes have groups
The predefined Mini-Mes SHALL have these groups: Thinking for Assistant, Scribe, Explorer,
Skeptic, Planner, Inquirer, Experimenter and Investigator; Literature for Researcher and
Theorist; Data for Profiler, Validator, Curator, Linker and Plotter.

#### Scenario: Data Mini-Mes
- **WHEN** the user types "@" alone
- **THEN** Profiler, Validator, Curator, Linker and Plotter are listed under Data
