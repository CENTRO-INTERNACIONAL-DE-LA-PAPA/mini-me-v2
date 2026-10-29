# Spec Delta

## MODIFIED Requirements

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
