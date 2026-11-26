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

### Requirement: A Trait is shown by its icon
Every built-in Trait SHALL carry an icon. Wherever the UI shows a Trait (the Library's Traits
list, a Mini-Me's Traits, the Trait editor's header and the Workflow editor's Trait Steps) it
SHALL show the Trait's icon as a plain line icon in ink, never on a filled or tinted tile. A
Trait without an icon, or whose icon the UI does not know, SHALL show the puzzle piece.

#### Scenario: Built-in Traits differ
- **WHEN** the user opens the Library's Traits section
- **THEN** *Summarize* and *Plot* each show their own icon, and neither shows the puzzle piece

#### Scenario: Trait Step
- **WHEN** a Workflow runs *Plot*
- **THEN** its node shows *Plot*'s icon

#### Scenario: Unknown icon
- **WHEN** `library.json` holds a Trait whose icon is not one the UI knows
- **THEN** the Trait is listed and shows the puzzle piece

### Requirement: Mini-Me definitions
Each Mini-Me SHALL have:
- an `id` (UUID, stable across installations);
- a `name` and a `description`;
- colours `tint`, `solid` and `ink`;
- an avatar: one part per avatar layer, by layer name: a `base`, `eyes` and a `mouth`, and
  optionally an `accessory` and a `held` item, each the id of one of the UI's avatar part
  files for that layer;
- a `group`, one of `thinking`, `literature` and `data`, which the `@` list shows it under;
- exactly one Workflow, a list of Steps as Workflows define them.

A Mini-Me's Traits are the Traits its Trait Steps reference. The predefined Mini-Mes are
built-in and read-only. User-made Mini-Mes are created, edited and deleted as the Library
editors describe. The list of Mini-Mes the UI gets SHALL say for each whether it is built-in.

#### Scenario: One-Step Workflow
- **WHEN** a Mini-Me whose Workflow has one Trait Step answers a message
- **THEN** that Step's Trait is the one called

#### Scenario: Multi-Step Workflow
- **WHEN** Investigator answers a message
- **THEN** its reply is produced by running each Step of its Workflow

#### Scenario: Unknown group
- **WHEN** the built-in library names a Mini-Me with a `group` other than `thinking`,
  `literature` or `data`, or with none
- **THEN** the library fails to load, naming that Mini-Me; a user-made Mini-Me with such a
  group is skipped instead

#### Scenario: User-made Mini-Me is listed
- **WHEN** the user has saved "Field Translator"
- **THEN** the UI's list of Mini-Mes includes it after the built-in ones, marked as not
  built-in

### Requirement: Avatars are drawn from layers
The UI SHALL draw an avatar by stacking its parts in layer order: Base, Eyes, Mouth, Accessory,
Held item. Each part SHALL be an SVG file in its layer's folder, used as exported: its body
and freckle placeholder colours SHALL take the Mini-Me's `solid` and `ink`. A layer without
parts SHALL NOT be offered, and an unknown part id SHALL draw nothing for its layer.

#### Scenario: Built-in Mini-Mes look as before
- **WHEN** the app shows Scribe
- **THEN** Scribe has the long base, round open eyes, no visible mouth and a bow tie, in
  Scribe's colours

#### Scenario: A new part
- **WHEN** a developer adds an exported SVG to the accessories folder
- **THEN** the next build offers it as an accessory, coloured and animated like the others

#### Scenario: Held item without parts
- **WHEN** the Held item folder is empty
- **THEN** no Held item is offered when picking a Mini-Me's avatar

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

### Requirement: A Mini-Me is shown by name, avatar and colour
The UI SHALL get the list of Mini-Mes (ID, name, description, colours, avatar, group) from the
Rust core. It SHALL show each reply authored by a Mini-Me with that Mini-Me's name and its
avatar, whose body is in its `solid` colour and whose freckles are in its `ink`. Wherever the
UI names a Mini-Me inline (an `@` mention in the composer, a sent message or a reply, an entry
in the `@` list, a name in a reaction tooltip), it SHALL show the Mini-Me's pill: its avatar
and name on a rounded chip in its `tint` with `ink` text. A reply whose Mini-Me is unknown
SHALL show "Mini-Me" with a neutral avatar, and an inline name of an unknown Mini-Me SHALL show
a neutral pill.

#### Scenario: Reply header
- **WHEN** Scribe answers
- **THEN** the reply's header reads "Scribe" next to Scribe's avatar in Scribe's solid
  colour

#### Scenario: Unknown Mini-Me
- **WHEN** a Conversation holds a reply from a Mini-Me that no longer exists
- **THEN** the reply is shown as "Mini-Me" with a neutral avatar and its text intact

#### Scenario: Mention in a sent message
- **WHEN** the user sends a message mentioning @Skeptic
- **THEN** "@Skeptic" is shown as Skeptic's pill

#### Scenario: Mention in the composer
- **WHEN** the user picks Skeptic from the `@` list
- **THEN** the composer shows "@Skeptic" as Skeptic's pill, with Skeptic's avatar

#### Scenario: Mention of a Mini-Me that no longer exists
- **WHEN** a sent message mentions a Mini-Me that no longer exists
- **THEN** its mention is shown as a neutral pill with the text it had

#### Scenario: Reaction tooltip
- **WHEN** the user points at a reaction Skeptic added
- **THEN** a tooltip names Skeptic as its pill

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

### Requirement: Built Traits keep their placeholder ID
When a change builds a Trait that is a placeholder, it SHALL keep the placeholder's ID and
replace its adapter, so anything that references the Trait keeps working.

#### Scenario: Building a placeholder
- **WHEN** a later change builds *Code*
- **THEN** *Code* has the same ID as its placeholder and no longer uses `echo`

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
In the `@`, `#` and `$` suggestion lists, the up and down arrow keys SHALL move a highlight
through the entries, and Enter or Tab SHALL pick the highlighted entry. Escape SHALL close the
list. The first entry SHALL be highlighted until the user moves the highlight, and again
whenever the query changes.

#### Scenario: Picking with the keyboard
- **WHEN** the user types "@" and presses the down arrow, then Enter
- **THEN** the second entry is inserted as a mention

#### Scenario: No match
- **WHEN** the user types "@zzz"
- **THEN** no list is shown, and Enter sends the message as usual

### Requirement: Picked references are pills in the composer
After the user picks a Mini-Me, a file or a table or chart in the composer, or adds a table
or chart with its reference button, the composer SHALL show that reference inline as it is
shown in a sent message: a Mini-Me's pill, a file chip, or a table or chart chip with its
icon. Typing, selecting, undo, paste and input methods SHALL work as in a plain text box, and
the caret SHALL stay where the text it follows is drawn, however many references the text
holds.

#### Scenario: Picked mention
- **WHEN** the user types "@Sk" and picks Skeptic
- **THEN** "@Skeptic" is shown as Skeptic's pill in the composer before sending

#### Scenario: Caret after several references
- **WHEN** the composer holds an `@` mention, a `#` file and a long `$` reference, and the
  user types after them
- **THEN** the caret is drawn right after the last character typed

### Requirement: Picked references act as one block
In the composer, a picked reference SHALL act as one block: the caret SHALL step over it, a
selection SHALL hold all of it or none of it, and Backspace or Delete next to it SHALL remove
all of it. The message SHALL be sent with the reference's label as its text, and copying or
cutting text with references SHALL put the text as it would be sent on the clipboard. A new
line typed with Shift+Enter SHALL be sent as a line break.

#### Scenario: Stepping over a picked mention
- **WHEN** the caret is right after a picked "@Skeptic" and the user presses the left arrow
- **THEN** the caret moves to just before "@"

#### Scenario: Deleting a picked mention
- **WHEN** the caret is right after a picked "@Skeptic" and the user presses Backspace
- **THEN** the whole mention is removed

#### Scenario: Sent text
- **WHEN** the user sends "Ask " followed by a picked "@Skeptic" and " about this"
- **THEN** the message's content is "Ask @Skeptic about this" and its `mini_me` Text
  Component covers "@Skeptic"

### Requirement: Predefined Mini-Mes have groups
The predefined Mini-Mes SHALL have these groups: Thinking for Assistant, Scribe, Explorer,
Skeptic, Planner, Inquirer, Experimenter and Investigator; Literature for Researcher and
Theorist; Data for Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist, Exploratory Data
Analysis and Diagnostic Analytics.

#### Scenario: Data Mini-Mes
- **WHEN** the user types "@" alone
- **THEN** Profiler, Validator, Curator, Linker, Plotter, CIP's Archivist, Exploratory Data
  Analysis and Diagnostic Analytics are listed under Data

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

### Requirement: The data Mini-Mes show their analyses in the reply
In the Exploratory Data Analysis Mini-Me's Workflow, the *Profile Data*, *Describe Variables*,
*Find Correlations*, *Detect Outliers*, *Find Clusters* and *Plot* Steps, and in the
Diagnostic Analytics Mini-Me's Workflow, the *Compare Groups*, *Find Drivers*, *Check
Confounders*, *Analyze Trends* and *Plot* Steps, SHALL have `show_results` set.

#### Scenario: An exploration's charts under the summary
- **WHEN** an Exploratory Data Analysis run ends
- **THEN** the reply shows the summary, then the tables and charts of the Steps that ran
