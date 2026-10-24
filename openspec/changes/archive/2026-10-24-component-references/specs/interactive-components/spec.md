## MODIFIED Requirements

### Requirement: Table component
The data of `table` version 1 SHALL be `{ columns, rows }` and optionally `title`,
`total_rows`, `source`, `source_id` and `sheet`. Each column has a `name` and a `type`
(`number`, `text`, `date` or `boolean`). Each row is a list with one value per column; a
value may be `null`. A table shown from a file SHALL name it in `source`, whether or not it
is a preview, with its Asset ID in `source_id` and, for Excel, the sheet in `sheet`. The UI
SHALL draw a table with a header row, numbers right-aligned in tabular figures, empty cells
for `null`, a scrollable body, and sorting by clicking a column header.

#### Scenario: Sorting
- **WHEN** the user clicks the header of the `yield` column
- **THEN** the rows are sorted by `yield`, and clicking again reverses the order

#### Scenario: Missing values
- **WHEN** a row has `null` for `yield`
- **THEN** that cell is empty, and sorting places it last

#### Scenario: Table shown from a file
- **WHEN** a Trait shows a preview of the sheet 2025 of `harvest.xlsx`
- **THEN** the component's data has `source` `harvest.xlsx`, its Asset ID as `source_id`,
  and `sheet` `2025`

#### Scenario: Whole small file
- **WHEN** a Trait shows all 80 rows of `field-trial-cleaned.csv`
- **THEN** the component's data has `source` `field-trial-cleaned.csv` and its `source_id`,
  and the UI shows no "Showing n of m rows" line
