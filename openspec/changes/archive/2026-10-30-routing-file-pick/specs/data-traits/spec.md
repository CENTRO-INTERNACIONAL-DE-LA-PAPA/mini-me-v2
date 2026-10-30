## MODIFIED Requirements

### Requirement: Tables a data Trait reads
A data Trait SHALL read, as tables, the Assets the message references with `#` and the
tables it references with `$`, in the order they appear in the message, then the Assets it
attaches. CSV (`.csv`), TSV (`.tsv`) and Excel (`.xlsx`) files are supported; the format
comes from the file name's extension. For a CSV or TSV the first row holds the column names.
For an Excel file, the Trait reads the sheet named in the message when one matches exactly,
and otherwise the first sheet, and its reply names the sheet it read; a `$` reference to a
table shown from an Excel file reads that table's sheet. A message that references a chart
with `$` SHALL fail with a message saying the Trait reads tables, naming the chart. Files are
read through `asset.read` only, so Project-folder confinement holds, and an Asset larger
than 100 MiB is refused.

When the message points to no table, every data Trait except Join Data SHALL read one table
instead: the reply's picked file when it is a table file, and otherwise the newest table
file of the Conversation. Its reply SHALL start by naming that file and saying why it was
used. The Conversation's files are the Assets attached to or referenced by its messages, so
the fallback never reaches other files of the Project.

#### Scenario: CSV referenced
- **WHEN** the user sends "@Profiler #field-trial.csv"
- **THEN** Profiler reads `field-trial.csv` as a table

#### Scenario: Excel with several sheets
- **WHEN** the message references `harvest.xlsx`, which has the sheets "2024" and "2025",
  and does not name one
- **THEN** the Trait reads "2024" and its reply says it read the sheet "2024" of
  `harvest.xlsx`

#### Scenario: No table
- **WHEN** the message references no CSV, TSV or Excel file and no table, there is no
  picked file, and the Conversation holds no table file
- **THEN** the reply fails with a message asking to reference a file with `#` or a table
  with `$`, or to attach a file

#### Scenario: Picked file
- **WHEN** Curator saved `field-trial-cleaned.csv` from `field-trial.csv`, the user sends
  "@Validator check the cleaned data", and Jev picks `field-trial-cleaned.csv`
- **THEN** Validator checks `field-trial-cleaned.csv`, and its reply says it used that file
  because the message seems to mean it

#### Scenario: Newest table of the Conversation
- **WHEN** a message tagged `harvest.csv`, the user then sends "@Plotter compare average
  yield by variety", and there is no picked file
- **THEN** Plot draws from `harvest.csv`, and its reply says it used that file because it
  is the newest table in the Conversation

#### Scenario: Picked file is not a table
- **WHEN** the picked file is `notes.txt` and the Conversation holds `harvest.csv`
- **THEN** the Trait reads `harvest.csv` as the newest table of the Conversation

#### Scenario: Join Data needs both tables tagged
- **WHEN** the user sends "@Linker join the two tables" without references
- **THEN** Join Data fails as before, asking for the tables to be referenced

#### Scenario: Unreadable file
- **WHEN** a referenced `.csv` cannot be parsed as a table
- **THEN** the reply fails with a message naming the file and what could not be read

#### Scenario: Table referenced
- **WHEN** the user sends "@Plotter plot $field-trial-cleaned", a preview of 500 of 12,340
  rows of `field-trial-cleaned.csv`
- **THEN** Plot draws from all 12,340 rows of `field-trial-cleaned.csv`

#### Scenario: File and table in order
- **WHEN** the user sends "@Linker join $plots with #harvest.csv"
- **THEN** Join Data reads the table `plots` first and `harvest.csv` second

#### Scenario: Chart referenced
- **WHEN** the user sends "@Profiler $Yield-by-variety"
- **THEN** the reply fails saying Profiler reads tables and `$Yield-by-variety` is a chart
