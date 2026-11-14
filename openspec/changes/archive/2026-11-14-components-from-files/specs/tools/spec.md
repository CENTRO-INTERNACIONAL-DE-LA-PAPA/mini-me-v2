## MODIFIED Requirements

### Requirement: Saving a file
The save-a-file tool SHALL take a file name, a media type, the file's bytes, at most
32 MiB, and whether the file is hidden (by default not). The file SHALL be saved through
`asset.write`, so a file that is not hidden is attached to the reply, and the tool SHALL
return the saved Asset's ID and name. A larger file SHALL fail without anything being
written. The form of the tool offered to a model SHALL NOT offer hidden files.

#### Scenario: Validation report
- **WHEN** Validator saves `field-trial-validation.html` as `text/html`
- **THEN** it is attached to the reply as a generated Asset

#### Scenario: Hidden results
- **WHEN** Theorize saves `theory-store.json` as hidden
- **THEN** it is stored in the Project and not attached to the reply

### Requirement: Adapters act through the tools
An adapter SHALL save files, show tables and charts and read files only through the tools,
never through `asset.write`, `component.add` or `asset.read` directly. The data Traits SHALL
read their tables through the read-a-table tool. An adapter that runs fixed code SHALL use
exactly the tools its Traits list. A provider adapter (Find Papers, Theorize, Search CIP
Dataverse) SHALL save its results with the save-a-file tool as a hidden file, then add its
own component kind with that file as its source. The data and Asta Traits' replies and files
SHALL be the same as when they acted on their own, apart from their hidden files.

#### Scenario: Cleaned table
- **WHEN** Curator cleans `field-trial.csv`
- **THEN** `field-trial-cleaned.csv` is saved by the save-a-file tool and the tables are
  shown by the show-a-table tool, and the reply looks as it did before

#### Scenario: Papers
- **WHEN** Researcher finds 12 papers
- **THEN** its adapter saves them as a hidden JSON file and adds a `paper-sources` component
  whose `source_asset_id` is that file

### Requirement: One show tool per component kind
The `table` and `chart` kinds SHALL each have a show tool: show-a-table (`table`) and
show-a-chart (`chart`, used only by Plot). The `paper-sources`, `theories` and
`dataset-results` kinds SHALL have no tool: only the provider adapter that owns each one adds
it. There SHALL be no tool that shows any kind. Each tool SHALL add its component through
`component.add`, with version 1, its preview, a plain-text alternative and its source file,
and return its ID.

#### Scenario: Paper list
- **WHEN** Find Papers shows its results
- **THEN** the reply shows the paper list, as before, without a show-papers tool

#### Scenario: Assistant cannot show theories
- **WHEN** Assistant answers a request about theories
- **THEN** it can show a table but not a `theories` component, since no tool adds one

### Requirement: Showing a table from given rows
The show-a-table tool SHALL accept a title, columns (each a name and a type: `number`,
`text`, `date` or `boolean`) and at most 500 rows, each with one value per column or
`null` and each value matching its column's type. It SHALL first save the rows as a CSV file
named after the title (or `Table`), then add a `table` version 1 component with that data,
the file as its source and a plain-text version of its first 20 rows. Rows a model gives SHALL
be saved as a visible file attached to the reply; rows an adapter computed, as a hidden file.

#### Scenario: Given rows
- **WHEN** a model shows a table "Sample yields" of 3 columns and 50 rows
- **THEN** `Sample yields.csv` is attached to the reply, and the reply gets a `table`
  component with those columns and rows whose source is that file

#### Scenario: Rows a Trait computed
- **WHEN** Profiler shows its table of `field-trial.csv`'s columns
- **THEN** the rows are saved as a hidden CSV file, which is the table's source and is not
  attached to the reply

#### Scenario: Row of the wrong length
- **WHEN** a row has 2 values for 3 columns
- **THEN** the tool fails naming the row, and no file or component is added

#### Scenario: Too many rows
- **WHEN** the tool is given 800 rows
- **THEN** it fails saying the limit is 500 rows, and no file or component is added

### Requirement: Reading a file
The read-a-file tool SHALL read by ID one Asset of the call's Conversation, hidden or not,
from an optional start. A CSV, TSV or Excel file
SHALL be returned as its columns and up to 500 rows from the start row, with the total row
count. Another UTF-8 file SHALL be returned as up to 100,000 characters from the start
character, with the total length. A file of any other kind SHALL fail as unreadable.

#### Scenario: Long report in pieces
- **WHEN** a model reads a 250,000-character `report.md`
- **THEN** it gets the first 100,000 characters and the total length, and reading again
  from 100,000 gives the next part

#### Scenario: Table rows from a start
- **WHEN** a model reads `trial.csv` of 1,200 rows from row 500
- **THEN** it gets rows 500 to 999, the columns and the total of 1,200

#### Scenario: Unreadable file
- **WHEN** the tool reads a PNG Asset
- **THEN** it fails saying the file is not text or a table and cannot be read

#### Scenario: Hidden source file
- **WHEN** a model reads the source file of an earlier `paper-sources` component
- **THEN** it gets the papers as JSON text

### Requirement: Reading a component
The read-a-component tool SHALL read one Interactive Component of the call's Conversation
by ID through `component.read`, and return its kind, its text and its source file's ID, with
a note to read that file with the read-a-file tool for its data. A component without a source
file SHALL be returned as its kind and text.

#### Scenario: Earlier table's rows
- **WHEN** the tool reads an earlier `table` component of 120 rows shown from `trial.csv`
- **THEN** it returns the table's text and the ID of `trial.csv` to read with read-a-file

#### Scenario: Preview of a file
- **WHEN** the tool reads a preview holding 500 of 12,340 rows of `field-trial-cleaned.csv`
- **THEN** it returns the table's text and the ID of `field-trial-cleaned.csv`, whose 12,340
  rows the model reads with read-a-file

#### Scenario: Chart
- **WHEN** the tool reads a bar chart of mean yield by variety drawn from `field-trial.csv`
- **THEN** it returns the chart's text and the ID of `field-trial.csv`

## REMOVED Requirements

### Requirement: Reading a referenced table
**Reason**: `$` references are removed; data Traits read tables only from files.
**Migration**: Reference the table's file with `#`.
