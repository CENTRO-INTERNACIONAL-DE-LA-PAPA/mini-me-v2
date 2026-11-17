## MODIFIED Requirements

### Requirement: Asset registry
Each Project SHALL keep a registry of its Assets in `project.sqlite`. Each Asset SHALL have an
`id` (UUIDv7), a `name` (original file name), a `media_type`, a `size_bytes`, a `source`
(`upload` or `generated`), a creation time and a `hidden` flag, `false` unless the Asset was
written as hidden. Assets SHALL be addressed by ID everywhere outside the registry.

#### Scenario: Registry entry after import
- **WHEN** a file is imported into a Project
- **THEN** the registry contains an entry with its ID, original name, media type, size,
  source `upload`, creation time and `hidden` `false`

#### Scenario: Registry from an older version
- **WHEN** a Project created by an earlier version of Mini-Me is opened
- **THEN** every Asset it already had is registered with `hidden` `false`

### Requirement: List Assets for references
The app SHALL provide the list of a Project's Assets that are not hidden, filtered by name, so
the user can pick one when typing `#` in the composer.

#### Scenario: Filter by name
- **WHEN** the user types `#trial` in the composer
- **THEN** the suggestions show the Project's Assets whose names contain "trial"

#### Scenario: Hidden file
- **WHEN** Profiler's reply saved the hidden file of its column table and the user types `#`
- **THEN** that hidden file is not among the suggestions

### Requirement: The Files screen lists a Project's Assets
The app SHALL show every Asset of the open Project that is not hidden on its Files screen,
newest first, with
its name, who added it, the Conversations that use it, when it was added and its size. "Who
added it" SHALL be the author recorded with the Asset when it is created: the user for a file
they upload, paste, drop or start, the Mini-Me whose reply saves a file, Scribe for a document
it drafted, and for a PDF exported from a document, whoever added that document. A file
downloaded from CIP Dataverse SHALL show "From Dataverse" in place of who added it, which
opens its dataset. An Asset
SHALL count as used in a Conversation when one of its messages attaches it or references it
with `#`. The Files screen SHALL filter Assets by name and by kind (data, documents, or files a Mini-Me
saved), import files with Upload, and open an Asset when its row is clicked.

#### Scenario: A file used in two Conversations
- **WHEN** the user attaches `field-trial.csv` to a message in one Conversation and
  references it with `#field-trial.csv` in another
- **THEN** the Files screen shows `field-trial.csv` as added by You and used in 2 conversations

#### Scenario: A file a Mini-Me saved
- **WHEN** Curator saves `trial-cleaned.csv` and attaches it to its reply
- **THEN** the Files screen shows `trial-cleaned.csv` under Mini-Me outputs, added by Curator

#### Scenario: A drafted report and its PDF
- **WHEN** Scribe drafts "Trial design.qmd" from a Conversation and the user exports it
- **THEN** the Files screen shows both "Trial design.qmd" and "Trial design.pdf" as added by
  Scribe

#### Scenario: A file from Dataverse
- **WHEN** the user downloads `late-blight-2021.csv` from a dataset in a results card
- **THEN** the Files screen shows it as "From Dataverse", which opens the dataset's DOI

#### Scenario: Hidden results of Researcher
- **WHEN** Researcher's reply saved its papers as a hidden JSON file
- **THEN** the Files screen does not list that file

## ADDED Requirements

### Requirement: Hidden files are hidden from the user only
A hidden Asset SHALL be stored and confined to its Project like any other Asset. The UI SHALL
NOT show it: not on the Files screen, in the `#` list, in the Outline, among the Overview's
latest outputs or as an attachment of a message. Traits and Jev SHALL see it like any other
file of the Conversation. It SHALL be deleted with its Project.

#### Scenario: Reading a hidden file
- **WHEN** a Trait reads, by its ID, the hidden JSON file of an earlier `paper-sources`
  component of its Conversation
- **THEN** it gets the file's content

#### Scenario: Listed to a model
- **WHEN** Researcher's reply saved its papers as a hidden `papers.json` and the user asks
  Assistant "which paper is the most recent?"
- **THEN** the model's list of the Conversation's files includes `papers.json`

### Requirement: Stored size follows the file
Whenever the core lists or reads an Asset, it SHALL compare the Asset's file with the
registry and, when the file's size differs, store the new size, so a file edited in another
application shows its current size. A missing file SHALL leave the registry unchanged.

#### Scenario: Edited in Excel
- **WHEN** the user opens `field-trial-cleaned.csv`, adds rows in Excel and saves, then opens
  the Files screen
- **THEN** the file's row shows its new size
