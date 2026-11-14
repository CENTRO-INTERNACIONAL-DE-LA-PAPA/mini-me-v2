## MODIFIED Requirements

### Requirement: Tables a data Trait reads
A data Trait SHALL read, as tables, the Assets the message references with `#`, in the order
they appear in the message, then the Assets it attaches. CSV (`.csv`),
TSV (`.tsv`) and Excel (`.xlsx`) files are supported; the format
comes from the file name's extension. For a CSV or TSV the first row holds the column names.
For an Excel file, the Trait reads the sheet named in the message when one matches exactly,
and otherwise the first sheet, and its reply names the sheet it read. Files are
read through `asset.read` only, so Project-folder confinement holds, and an Asset larger
than 100 MiB is refused.

When the message points to no table, every data Trait except Join Data SHALL read one table
instead: the reply's picked file when it is a table file, and otherwise the newest table
file of the Conversation that is not hidden. Its reply SHALL start by naming that file and saying why it was
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
- **WHEN** the message references no CSV, TSV or Excel file, there is no picked file, and
  the Conversation holds no table file
- **THEN** the reply fails with a message asking to reference a file with `#` or to attach a
  file

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

#### Scenario: Newest table after a profile
- **WHEN** Profiler profiled `field-trial.csv`, saving its column table as a hidden file, and
  the user sends "@Plotter plot yield by variety" with no reference and no picked file
- **THEN** Plot draws from `field-trial.csv`, not from the hidden column table

#### Scenario: Join Data needs both tables tagged
- **WHEN** the user sends "@Linker join the two tables" without references
- **THEN** Join Data fails as before, asking for the tables to be referenced

#### Scenario: Unreadable file
- **WHEN** a referenced `.csv` cannot be parsed as a table
- **THEN** the reply fails with a message naming the file and what could not be read

#### Scenario: Table referenced
- **WHEN** an earlier reply showed a preview of 500 of 12,340 rows of
  `field-trial-cleaned.csv` and the user sends "@Plotter plot #field-trial-cleaned.csv"
- **THEN** Plot draws from all 12,340 rows of `field-trial-cleaned.csv`

#### Scenario: File and table in order
- **WHEN** the user sends "@Linker join #plots.csv with #harvest.csv"
- **THEN** Join Data reads `plots.csv` first and `harvest.csv` second

#### Scenario: Chart referenced
- **WHEN** Plotter drew "Yield by variety" from `field-trial.csv` and the user sends
  "@Profiler profile the data behind the yield chart" without a reference
- **THEN** Profiler profiles the reply's picked file, which Jev picks from the file options
  that name the chart

### Requirement: A chart records its file
Each chart Plot draws SHALL record the table file it was drawn from as the component's
`source_asset_id`, and that file's name as `source` in its preview. The preview SHALL hold no
rows of the file beyond the values its views need.

#### Scenario: Drawn from a file
- **WHEN** Plot draws "Yield by variety" from `field-trial.csv`
- **THEN** the chart's `source_asset_id` is the ID of `field-trial.csv`, and its preview's
  `source` is `field-trial.csv`

#### Scenario: Drawn from a referenced table
- **WHEN** an earlier reply previewed `field-trial.csv` and Plot draws from
  `#field-trial.csv`
- **THEN** the chart records `field-trial.csv`
