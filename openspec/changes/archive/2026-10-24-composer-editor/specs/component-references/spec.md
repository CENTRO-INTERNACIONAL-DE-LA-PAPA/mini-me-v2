## MODIFIED Requirements

### Requirement: Component names
A table's name SHALL be the file name of its `source` without the extension. A table that
comes from no file SHALL be named after its `title`, without a `.csv`, `.tsv` or `.xlsx`
extension, and one with no title "table". A chart SHALL be named after its `title`, and one
with no title "chart". Characters other than letters, digits, `-`, `_` and `.` SHALL become
`-`, and a run of `-` SHALL become one.

#### Scenario: Preview of a file
- **WHEN** a table's `source` is `field-trial-cleaned.csv`
- **THEN** its name is `field-trial-cleaned`

#### Scenario: Small table of a file
- **WHEN** Curator shows all 80 rows of the saved `field-trial-cleaned.csv`
- **THEN** the table's `source` is `field-trial-cleaned.csv` and its name is
  `field-trial-cleaned`

#### Scenario: Table without a file
- **WHEN** a table titled "Columns of trial.csv" has no source file
- **THEN** its name is `Columns-of-trial`

#### Scenario: Chart
- **WHEN** Plot shows a chart titled "Yield by variety"
- **THEN** its name is `Yield-by-variety`

#### Scenario: Title with a dash between spaces
- **WHEN** Plot shows a chart titled "Blight severity — distribution by variety"
- **THEN** its name is `Blight-severity-distribution-by-variety`
