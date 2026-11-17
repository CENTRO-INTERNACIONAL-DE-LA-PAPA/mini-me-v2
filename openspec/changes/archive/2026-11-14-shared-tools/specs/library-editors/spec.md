## MODIFIED Requirements

### Requirement: User-made Traits are prompt-based
A user-made Trait SHALL run on the `prompt` adapter. Its editor SHALL let the user set the
name, the description and the instructions (required, non-empty). The editor SHALL offer no
choice of tools: every tool is offered to it as to every prompt-based Trait.

#### Scenario: New Trait
- **WHEN** the user creates a Trait named "Translate" with instructions, then saves
- **THEN** the library holds *Translate* with adapter `prompt` and no list of tools

#### Scenario: Empty instructions
- **WHEN** the user tries to save a Trait without instructions
- **THEN** the save is refused and the editor says the instructions are missing

#### Scenario: A Trait that suggests edits
- **WHEN** a Mini-Me running *Translate* is @-mentioned in a comment thread
- **THEN** its model can suggest an edit to the thread's passage, with no setting in the
  editor

#### Scenario: A Trait that edits documents
- **WHEN** a Mini-Me running *Translate* answers a message that references a document
- **THEN** its model can suggest edits to that document, with no setting in the editor

### Requirement: Saves are checked
The Rust core SHALL check every save with the library's rules (Workflow rules, names, IDs,
instructions) against the built-in and user-made definitions together. It SHALL refuse a save
that breaks a rule, and return each problem for the editor to show. It SHALL refuse to save or
delete a built-in definition.

#### Scenario: Unknown Trait in a save
- **WHEN** a save names a Mini-Me whose Trait Step references a Trait ID the library does not
  hold
- **THEN** the save is refused, naming the Step

### Requirement: Broken user entries are skipped
When the app loads `library.json`, the Rust core SHALL skip each user-made entry that
breaks a rule, and each Mini-Me whose Workflow references a skipped Trait. It SHALL start
with the remaining definitions and show the skipped entries and their problems in the Library
view. Saves SHALL keep skipped entries in the file unchanged.

#### Scenario: One broken Trait
- **WHEN** `library.json` holds a Trait with empty instructions on the prompt adapter, and a
  Mini-Me that runs it
- **THEN** the app starts, both entries are missing from the `@` list, and the Library view
  names them with the reason

#### Scenario: Unreadable file
- **WHEN** `library.json` is not valid JSON
- **THEN** the app starts with the built-in definitions, the Library view says the file could
  not be read, and creating, editing or deleting user-made definitions is refused, so the
  file is not overwritten
