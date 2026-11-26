# Spec Delta

## MODIFIED Requirements

### Requirement: Reading a file
The read-a-file tool SHALL read by ID one Asset of the call's Conversation, hidden or not,
from an optional start. A CSV, TSV or Excel file
SHALL be returned as its description (as "What the model sees of the data" describes it), up to
20 rows from the start row, the total row count, and a note that a table is shown to the user
with the show-a-table tool and the file's ID; given `rows`, as its columns and that many rows
from the start row, at most 500, with the total row count. Another UTF-8 file SHALL be returned as up to 100,000 characters from the start
character, with the total length. A file of any other kind SHALL fail as unreadable.

#### Scenario: Long report in pieces
- **WHEN** a model reads a 250,000-character `report.md`
- **THEN** it gets the first 100,000 characters and the total length, and reading again
  from 100,000 gives the next part

#### Scenario: A table read without rows
- **WHEN** a model reads `trial.csv` of 1,200 rows
- **THEN** it gets the table's description, rows 0 to 19, the total of 1,200 and the note
  about the show-a-table tool, and not the other rows

#### Scenario: Table rows from a start
- **WHEN** a model reads `trial.csv` of 1,200 rows from row 500 with `rows` 600
- **THEN** it gets rows 500 to 999, the columns and the total of 1,200

#### Scenario: Unreadable file
- **WHEN** the tool reads a PNG Asset
- **THEN** it fails saying the file is not text or a table and cannot be read

#### Scenario: Hidden source file
- **WHEN** a model reads the source file of an earlier `paper-sources` component
- **THEN** it gets the papers as JSON text
