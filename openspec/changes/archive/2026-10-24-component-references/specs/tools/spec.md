## MODIFIED Requirements

### Requirement: Reading a component
The read-a-component tool SHALL read one Interactive Component of the call's Conversation
by ID through `component.read`. A `table` component SHALL be returned as its columns and
rows, with its total row count, and for a table whose `source_asset_id` is set, that Asset's
ID, so the full table can be read with the read-a-file tool. Another kind SHALL be returned
as its data, at most 100,000 characters, saying when it was cut; for a `chart`, that is its
views with their plotted values.

#### Scenario: Earlier table's rows
- **WHEN** the tool reads an earlier `table` component of 120 rows
- **THEN** it returns all 120 rows, not only the 20 rows of the component's text

#### Scenario: Preview of a file
- **WHEN** the tool reads a preview holding 500 of 12,340 rows of `field-trial-cleaned.csv`
- **THEN** it returns the 500 rows, the total of 12,340 and the Asset ID of
  `field-trial-cleaned.csv`

#### Scenario: Chart
- **WHEN** the tool reads a bar chart of mean yield by variety
- **THEN** it returns the chart's title and views with their bars

## ADDED Requirements

### Requirement: Reading a referenced table
The read-a-table tool SHALL also read a `component` Text Component that references a `table`
as a table: from the component's source Asset when its `source_asset_id` is set, and from
the component's columns and rows otherwise. The table SHALL be named after the table's name
with a `.csv` extension, and keep the column types of the component. The source Asset is
read through `asset.read` by ID, so Project-folder confinement holds.

#### Scenario: Reference to a preview
- **WHEN** a data Trait reads `$field-trial-cleaned`, a preview of
  `field-trial-cleaned.csv`
- **THEN** it gets all rows of `field-trial-cleaned.csv` as a table named
  `field-trial-cleaned.csv`

#### Scenario: Table without a file
- **WHEN** a data Trait reads `$Profile-of-trial`, a table with no source file
- **THEN** it gets the component's columns and rows as a table named `Profile-of-trial.csv`
