# library-editors Specification

## Purpose
Lets users build their own Mini-Mes and Traits: the Library view that lists them, the
editors that create, duplicate, edit and delete them, and how the Rust core stores them
app-wide.

## Requirements

### Requirement: The Library view lists Mini-Mes and Traits
The sidebar SHALL offer a "Mini-Mes & Traits" entry that opens the Library view. The Library
view SHALL have two sections, Mini-Mes and Traits, picked from a vertical list beside them.
The Mini-Mes section SHALL list every Mini-Me, and the Traits section every Trait except the
placeholder Traits. Each entry SHALL show its name and description and SHALL be marked as
built-in or user-made. Picking an entry SHALL open its editor.

#### Scenario: Opening the Library
- **WHEN** the user picks "Mini-Mes & Traits" in the sidebar
- **THEN** the Mini-Mes section lists Scribe, Skeptic and Profiler, each marked as built-in

#### Scenario: Traits section
- **WHEN** the user picks Traits in the Library view
- **THEN** *Refute* and *Plot* are listed, each marked as built-in

#### Scenario: Placeholders are not listed
- **WHEN** the Traits section is open
- **THEN** *Document* and the other placeholder Traits are not listed

### Requirement: Mini-Mes can be filtered by group
In the Mini-Mes section, each Mini-Me SHALL show its group, and filter chips SHALL offer All
and each group that a Mini-Me has. Picking a group SHALL list only the Mini-Mes in it.

#### Scenario: Data filter
- **WHEN** the user picks the Data chip
- **THEN** Profiler, Validator, Curator, Linker and Plotter are listed, and Scribe is not

### Requirement: Built-in definitions can only be duplicated
The editor of a built-in Mini-Me or Trait SHALL show its definition read-only and SHALL offer
Duplicate but not Save or Delete. Duplicate SHALL be offered for every built-in Mini-Me and
for each built-in Trait whose adapter is `prompt`. It SHALL NOT be offered for Traits that
run fixed code (Asta and data Traits).

#### Scenario: Built-in Mini-Me
- **WHEN** the user opens Skeptic in the Library
- **THEN** its fields cannot be changed, and Duplicate is offered

#### Scenario: Fixed-code Trait
- **WHEN** the user opens *Find Papers*
- **THEN** its definition is shown without instructions to edit, and no Duplicate is offered

### Requirement: Duplicating a definition
Duplicate SHALL open the editor on a new, unsaved user-made copy whose fields equal the
original's, with a new ID and the name "<name> Copy", or "<name> Copy <n>" with the smallest
n from 2 that makes the name unused. The copy SHALL exist only after the user saves it.

#### Scenario: Duplicating Skeptic
- **WHEN** the user duplicates Skeptic and saves
- **THEN** a user-made Mini-Me "Skeptic Copy" exists, with Skeptic's colours, avatar, group,
  description and Workflow, and Skeptic is unchanged

#### Scenario: Name already taken
- **WHEN** "Plan Copy" exists and the user duplicates *Plan*
- **THEN** the copy is named "Plan Copy 2"

### Requirement: User-made Traits are prompt-based
A user-made Trait SHALL run on the `prompt` adapter. Its editor SHALL let the user set the
name, the description, the instructions (required, non-empty) and which of the model tools
`save_file`, `show_table`, `write_document`, `suggest_edit` and `edit_document` the Trait may
use. The read tools SHALL be offered to it as to every prompt-based Trait, without being listed.

#### Scenario: New Trait
- **WHEN** the user creates a Trait named "Translate" with instructions and `save_file`
  ticked, then saves
- **THEN** the library holds *Translate* with adapter `prompt` and tools `["save_file"]`

#### Scenario: Empty instructions
- **WHEN** the user tries to save a Trait without instructions
- **THEN** the save is refused and the editor says the instructions are missing

#### Scenario: A Trait that suggests edits
- **WHEN** the user ticks "Suggest edits" for *Translate* and saves
- **THEN** *Translate* lists `suggest_edit`, and a Mini-Me running it can suggest edits when
  @-mentioned in a comment thread

#### Scenario: A Trait that edits documents
- **WHEN** the user ticks "Edit documents" for *Translate* and saves
- **THEN** *Translate* lists `edit_document`, and a Mini-Me running it can suggest edits to a
  document referenced in a Conversation

### Requirement: Editing a Trait affects every Mini-Me that uses it
Saving a user-made Trait SHALL change it for every Mini-Me whose Workflow references it. The
Trait editor SHALL list the Mini-Mes that use the Trait.

#### Scenario: Shared Trait
- **WHEN** two user-made Mini-Mes run *Translate* and the user edits its instructions
- **THEN** the next reply from either Mini-Me uses the new instructions, and the editor
  listed both Mini-Mes

### Requirement: A Trait in use cannot be deleted
Deleting a user-made Trait SHALL be refused while any Mini-Me's Workflow references it, and
the editor SHALL name those Mini-Mes. Deleting an unused Trait SHALL ask for confirmation
first.

#### Scenario: Trait in use
- **WHEN** the user deletes *Translate* while "Field Translator" runs it
- **THEN** *Translate* is kept, and the editor says "Field Translator" still uses it

### Requirement: Editing a user-made Mini-Me
The Mini-Me editor SHALL show three tabs: Workflow, Traits (with how many Traits the
Workflow runs) and Appearance. The Appearance tab SHALL let the user set the name, the
description and the group (`thinking`, `literature` or `data`), and pick the avatar's base,
face and optional accessory from the avatar parts, showing a live preview. The description
SHALL be required, because routing uses it to choose a Mini-Me. The Traits tab SHALL list
the Traits the Workflow runs, each opening its Trait editor. Save SHALL save every tab.

#### Scenario: New Mini-Me
- **WHEN** the user creates "Field Translator" in the Thinking group with a base, a face, no
  accessory and a description, and saves
- **THEN** "Field Translator" is listed under Thinking in the `@` list with that avatar

#### Scenario: Traits tab
- **WHEN** the user opens Investigator's Traits tab
- **THEN** it reads "Traits · 5" and lists *Scout*, *Wonder*, *Plan*, *Refute* and
  *Experiment*, each opening its Trait editor

### Requirement: Picking a Mini-Me's colour
The Mini-Me editor SHALL offer the colour families as swatches and a hue slider. The chosen
hue SHALL set the Mini-Me's `solid` and `ink` as the avatar palette does, and its `tint` as
the tint of the same hue (oklch lightness 0.94, chroma 0.04). A family with fixed `solid` and
`ink` values SHALL keep them.

#### Scenario: Custom hue
- **WHEN** the user moves the hue slider to 120 and saves
- **THEN** the Mini-Me's `tint`, `solid` and `ink` are the oklch colours of hue 120, and its
  pill and avatar use them

#### Scenario: Colour family
- **WHEN** the user picks the Purple swatch
- **THEN** the `solid` is `#6E5BFF` and the `ink` is `#4A3AE0`

### Requirement: Names are unique
A save SHALL be refused when the name is empty, or when another Mini-Me (for a Mini-Me) or
another Trait (for a Trait) has the same name, ignoring case. A Trait's name SHALL be in Title
Case: each word starts with a capital letter or a digit.

#### Scenario: Taken Mini-Me name
- **WHEN** the user saves a Mini-Me named "skeptic"
- **THEN** the save is refused because Skeptic exists

#### Scenario: Trait name not in Title Case
- **WHEN** the user saves a Trait named "translate text"
- **THEN** the save is refused and the editor says the name must be in Title Case

### Requirement: Deleting a user-made Mini-Me
Deleting a user-made Mini-Me SHALL ask for confirmation, then remove it from the library. Its
earlier replies SHALL be kept and shown as replies from a Mini-Me that no longer exists. A run
of it that is paused at an approval SHALL still resume with the definitions it started with.

#### Scenario: Deleted Mini-Me in a Conversation
- **WHEN** the user deletes "Field Translator" and opens a Conversation it replied in
- **THEN** its replies are shown as "Mini-Me" with a neutral avatar and their text intact

### Requirement: Saved definitions take effect on the next message
After a save or delete, the `@` list, the Library view, Mini-Me pills and routing SHALL use
the new definitions, without restarting the app. A reply's run SHALL use the definitions that
held when it started.

#### Scenario: Routed to a new Mini-Me
- **WHEN** the user saves "Field Translator", then sends a message without a mention that Jev
  matches to it with confidence above the threshold
- **THEN** "Field Translator" answers

#### Scenario: Edit during a run
- **WHEN** a user-made Mini-Me is replying and the user edits its Trait's instructions
- **THEN** that reply finishes with the old instructions, and the next one uses the new ones

### Requirement: User-made definitions are stored app-wide
The Rust core SHALL store user-made Mini-Mes and Traits in `user-library.json` in the
Mini-Me Data folder, as `{ "traits": [...], "mini_mes": [...] }` in the built-in library's
format. It SHALL write the file atomically on each save or delete. No Project folder SHALL
be read or written, and no Trait SHALL be able to reach the file, so Project-folder
confinement holds.

#### Scenario: Kept across Projects and restarts
- **WHEN** the user saves "Field Translator" in one Project, restarts the app and opens
  another Project
- **THEN** "Field Translator" is in the `@` list

#### Scenario: No file yet
- **WHEN** the app starts and `user-library.json` does not exist
- **THEN** the library holds only the built-in definitions, and the first save creates the
  file

### Requirement: Saves are checked
The Rust core SHALL check every save with the library's rules (tools, Workflow rules, names,
IDs) against the built-in and user-made definitions together. It SHALL refuse a save that
breaks a rule, and return each problem for the editor to show. It SHALL refuse to save or
delete a built-in definition.

#### Scenario: Unknown Trait in a save
- **WHEN** a save names a Mini-Me whose Trait Step references a Trait ID the library does not
  hold
- **THEN** the save is refused, naming the Step

### Requirement: Broken user entries are skipped
When the app loads `user-library.json`, the Rust core SHALL skip each user-made entry that
breaks a rule, and each Mini-Me whose Workflow references a skipped Trait. It SHALL start
with the remaining definitions and show the skipped entries and their problems in the Library
view. Saves SHALL keep skipped entries in the file unchanged.

#### Scenario: One broken Trait
- **WHEN** `user-library.json` holds a Trait listing the tool `show_chart` on the prompt
  adapter, and a Mini-Me that runs it
- **THEN** the app starts, both entries are missing from the `@` list, and the Library view
  names them with the reason

#### Scenario: Unreadable file
- **WHEN** `user-library.json` is not valid JSON
- **THEN** the app starts with the built-in definitions, the Library view says the file could
  not be read, and creating, editing or deleting user-made definitions is refused, so the
  file is not overwritten
