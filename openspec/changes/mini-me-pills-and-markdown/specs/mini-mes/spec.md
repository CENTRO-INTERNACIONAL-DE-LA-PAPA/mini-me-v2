# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
text box. A reference the user edits SHALL lose its pill and become plain text, as it does when
sent.

#### Scenario: Picked mention
- **WHEN** the user types "@Sk" and picks Skeptic
- **THEN** "@Skeptic" is shown as Skeptic's pill in the composer before sending

#### Scenario: Editing a picked mention
- **WHEN** the user deletes a letter from a picked "@Skeptic"
- **THEN** the remaining text is shown without a pill

### Requirement: Predefined Mini-Mes have groups
The predefined Mini-Mes SHALL have these groups: Thinking for Assistant, Scribe, Explorer,
Skeptic, Planner, Inquirer, Experimenter and Investigator; Literature for Researcher and
Theorist; Data for Profiler, Validator, Curator, Linker and Plotter.

#### Scenario: Data Mini-Mes
- **WHEN** the user types "@" alone
- **THEN** Profiler, Validator, Curator, Linker and Plotter are listed under Data
