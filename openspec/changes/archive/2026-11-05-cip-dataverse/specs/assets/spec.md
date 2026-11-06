# Spec Delta

## MODIFIED Requirements

### Requirement: The Files screen lists a Project's Assets
The app SHALL show every Asset of the open Project on its Files screen, newest first, with
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
