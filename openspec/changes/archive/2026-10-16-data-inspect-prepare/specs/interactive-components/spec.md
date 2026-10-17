# Spec Delta

## MODIFIED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component data SHALL come only
from the adapters of built-in Traits that list the kind. Adding a kind SHALL NOT need a
change to the event protocol, the link protocol or the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1 and `table`
  version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind a built-in Trait lists has a renderer for version 1

## ADDED Requirements

### Requirement: Table component
The data of `table` version 1 SHALL be `{ columns, rows }` and optionally `title`,
`total_rows` and `source`. Each column has a `name` and a `type` (`number`, `text`, `date`
or `boolean`). Each row is a list with one value per column; a value may be `null`. The UI
SHALL draw a table with a header row, numbers right-aligned in tabular figures, empty cells
for `null`, a scrollable body, and sorting by clicking a column header.

#### Scenario: Sorting
- **WHEN** the user clicks the header of the `yield` column
- **THEN** the rows are sorted by `yield`, and clicking again reverses the order

#### Scenario: Missing values
- **WHEN** a row has `null` for `yield`
- **THEN** that cell is empty, and sorting places it last

### Requirement: Table previews
When a `table` component's `total_rows` is larger than its number of rows, it is a preview
and `source` names the Asset holding the full table. The UI SHALL then say "Showing n of m
rows" and name the source Asset.

#### Scenario: Preview of a large table
- **WHEN** a component holds 500 rows with `total_rows` 12,340 and `source`
  `field-trial-cleaned.csv`
- **THEN** the table shows the 500 rows and "Showing 500 of 12,340 rows", naming
  `field-trial-cleaned.csv`
