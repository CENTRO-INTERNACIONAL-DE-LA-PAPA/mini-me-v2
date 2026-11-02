# Spec Delta

## ADDED Requirements

### Requirement: File actions
Each file row in Files, and wherever a file row appears such as the Overview's outputs, SHALL have a
"…" menu with Rename, Delete, Open, Show in folder and Duplicate. Rename SHALL keep the extension and
change only the name stored for the file's ID. Duplicate SHALL add a copy named "<name> copy".

#### Scenario: Rename
- **WHEN** the user renames `field-trial.csv` to `trial-2025`
- **THEN** the file is `trial-2025.csv`, and messages that referenced it still refer to it

#### Scenario: Duplicate
- **WHEN** the user duplicates `field-trial.csv`
- **THEN** Files lists `field-trial copy.csv` as a new file

#### Scenario: Show in folder
- **WHEN** the user picks Show in folder
- **THEN** the system's file manager opens at the file

### Requirement: Deleting a file
Delete SHALL ask first, and after confirmation SHALL remove the file's record and its folder in the
Project. References to it in messages SHALL show as a "file removed" chip.

#### Scenario: Delete
- **WHEN** the user confirms deleting `field-trial.csv`
- **THEN** it is gone from Files and from the Project's folder

#### Scenario: A reference to a deleted file
- **WHEN** a message references a file that was deleted
- **THEN** the reference shows as a "file removed" chip and opens nothing
