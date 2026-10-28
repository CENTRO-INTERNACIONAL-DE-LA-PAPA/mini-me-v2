# Spec Delta

## Purpose

Lets users see and build a Mini-Me's Workflow as a graph on a canvas: how Steps are drawn
and laid out, how they are added and moved by drag and drop, and how the inspector edits
the selected Step.

## ADDED Requirements

### Requirement: The Workflow tab draws the Workflow
The Mini-Me editor's Workflow tab SHALL draw the Workflow from top to bottom, from a "When
invoked" start to a "Reply in conversation" end, both showing the Mini-Me's avatar. Each
Trait Step and approval SHALL be a node, each condition and parallel split a marker with
its branches side by side and labelled, and each loop a frame around its Steps showing its
limit. Connectors SHALL join Steps in the order they run.

#### Scenario: Investigator
- **WHEN** the user opens Investigator's Workflow tab
- **THEN** "In parallel" splits into "Directions" (*Scout*) and "Questions" (*Wonder*),
  which join before *Plan*. A loop frame of *Refute* and *Plan* follows, then a condition
  with a "testable" branch (an approval, then *Experiment*) and a "not testable" branch
  (*Wonder*).

### Requirement: Nodes show what their Step does
A Trait Step's node SHALL show its Trait's name and a meta line naming how many tools the
Trait lists, or none. An approval's node SHALL show its prompt. A marker or loop pill SHALL
show the Step's label. Without a label, a condition shows its question, a parallel split "In
parallel", and a loop its limit.

#### Scenario: Trait node
- **WHEN** a Workflow runs *Assist*, which lists `save_file` and `show_table`
- **THEN** its node reads "Assist" with the meta line "2 tools"

### Requirement: Steps are placed automatically
The canvas SHALL place every Step itself from the Workflow's order and nesting. Saving SHALL
store no positions, and the Workflow SHALL keep the format the core checks and runs.

#### Scenario: Saved format
- **WHEN** the user adds a Step on the canvas and saves
- **THEN** the saved Workflow holds only Steps, as before, with no layout data

### Requirement: Adding a Step by dragging it onto a connector
For a user-made Mini-Me, the canvas SHALL offer a toolbar of Trait step, Approval,
Condition, Loop and Parallel. Dropping one onto a connector SHALL insert a new Step there,
with an ID unique within the Workflow, and select it. A Trait step SHALL ask which Trait it
runs before it is inserted, offering every Trait except the placeholders.

#### Scenario: Adding a Trait step
- **WHEN** the user drags Trait step onto the connector between *Scout* and *Plan* and picks
  *Refute*
- **THEN** *Refute* runs between *Scout* and *Plan*

#### Scenario: Adding a condition
- **WHEN** the user drops Condition onto a connector
- **THEN** a condition with the branches "Yes" and "No" is inserted and selected, and each
  branch shows an empty slot to drop Steps into

### Requirement: Moving a Step by dragging it
Dragging a node or marker of a user-made Mini-Me onto another connector or empty slot SHALL
move that Step there, with every Step nested inside it. A Step SHALL NOT be dropped inside
itself.

#### Scenario: Moving into a branch
- **WHEN** the user drags *Plan* onto the empty slot of a condition's "Yes" branch
- **THEN** *Plan* runs in that branch and no longer where it was

#### Scenario: Dropping a loop inside itself
- **WHEN** the user drags a loop onto a connector inside that loop
- **THEN** nothing moves

### Requirement: Drag and drop works where files can be dropped
Dragging Steps SHALL work on Windows, macOS and Linux while the app accepts files dropped on
its window.

#### Scenario: Windows
- **WHEN** the user drags Approval onto a connector in the Windows app
- **THEN** the approval is inserted there

### Requirement: The inspector edits a Trait Step
Selecting a Trait Step SHALL show in the inspector:
- its Trait, which the user can change;
- the Trait's description and its tools in plain words;
- how many Mini-Mes use the Trait, with a link to its Trait editor;
- an "Ask before running" toggle;
- Remove step.

#### Scenario: Changing the Trait
- **WHEN** the user selects a *Scout* Step and picks *Wonder* in the inspector
- **THEN** the Step runs *Wonder*

### Requirement: Ask before running adds an approval
The "Ask before running" toggle SHALL be on when the Step right before a Trait Step, in the
same list, is the approval it adds: one with the prompt "Run <Trait name>?". Turning it on
SHALL insert that approval right before the Step. Turning it off SHALL remove it. An approval
with any other prompt SHALL be left alone.

#### Scenario: Turning it on
- **WHEN** the user turns on "Ask before running" for a *Refute* Step
- **THEN** an approval "Run Refute?" is inserted right before it, and the toggle stays on

#### Scenario: An approval the user wrote
- **WHEN** a *Plan* Step follows the approval "Is the dataset the latest?"
- **THEN** the toggle is off, and turning it on inserts "Run Plan?" between them

### Requirement: The inspector edits a control Step
Selecting a control Step SHALL let the user edit:
- an approval's prompt;
- a condition's or loop's question;
- a loop's limit, from 1 to 10;
- the labels of a condition's or parallel split's branches, and add or remove a branch,
  keeping at least two.
Every Step SHALL offer Remove step.

#### Scenario: Third branch
- **WHEN** the user adds a branch to a parallel split
- **THEN** a third branch with an empty slot appears beside the others

#### Scenario: Removing a branch with Steps
- **WHEN** the user removes a branch holding two Steps
- **THEN** the inspector asks once more, naming the branch and its 2 Steps, before removing

#### Scenario: Two branches left
- **WHEN** a condition has two branches
- **THEN** neither can be removed

### Requirement: Removing a Step
Remove step SHALL delete the Step and every Step nested inside it. When the Workflow has only
one Step, it SHALL NOT be removed.

#### Scenario: Removing a loop
- **WHEN** the user removes a loop holding *Refute* and *Plan*
- **THEN** the loop and both Steps are gone, and the Steps around it are joined

### Requirement: Unfinished Steps are explained on save
Saving a Workflow with an empty branch or loop, or an empty prompt or question, SHALL be
refused with the core's problems, and the editor SHALL keep every edit.

#### Scenario: Empty branch
- **WHEN** the user saves a condition whose "No" branch is empty
- **THEN** the save is refused, saying that branch has no Steps, and the canvas is unchanged

### Requirement: Built-in Workflows are read-only
For a built-in Mini-Me, the canvas SHALL offer no toolbar and no dragging, and the inspector
SHALL show the selected Step without letting it change.

#### Scenario: Built-in Mini-Me
- **WHEN** the user opens Skeptic's Workflow tab and selects *Refute*
- **THEN** the inspector shows *Refute* read-only, and no Step can be dragged
