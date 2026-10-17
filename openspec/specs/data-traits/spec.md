# data-traits Specification

## Purpose

Defines the data Traits: built-in Traits that run fixed tools over tabular Assets, which
files they read, what the AI model may see of the data, and what each Trait computes,
replies with and saves.

## Requirements

### Requirement: Tables a data Trait reads
A data Trait SHALL read the Assets the message references with `#` or attaches, in that
order, as tables. CSV (`.csv`), TSV (`.tsv`) and Excel (`.xlsx`) files are supported; the
format comes from the file name's extension. For a CSV or TSV the first row holds the column
names. For an Excel file, the Trait reads the sheet named in the message when one matches
exactly, and otherwise the first sheet, and its reply names the sheet it read. Files are
read through `asset.read` only, so Project-folder confinement holds, and an Asset larger
than 100 MiB is refused.

#### Scenario: CSV referenced
- **WHEN** the user sends "@Profiler #field-trial.csv"
- **THEN** Profiler reads `field-trial.csv` as a table

#### Scenario: Excel with several sheets
- **WHEN** the message references `harvest.xlsx`, which has the sheets "2024" and "2025",
  and does not name one
- **THEN** the Trait reads "2024" and its reply says it read the sheet "2024" of
  `harvest.xlsx`

#### Scenario: No table
- **WHEN** the message references no CSV, TSV or Excel file
- **THEN** the reply fails with a message asking to reference one with `#` or attach it

#### Scenario: Unreadable file
- **WHEN** a referenced `.csv` cannot be parsed as a table
- **THEN** the reply fails with a message naming the file and what could not be read

### Requirement: What the model sees of the data
When a data Trait asks the AI model to choose checks, actions or keys, it SHALL send the
user's message and a description of each table: its file name, row count, and for each
column the name, type, count of missing values, count of distinct values, and the minimum
and maximum when the column is numeric or a date. For a column with at most 30 distinct
values, the description also lists up to its 20 most frequent values with their counts. A
column whose name suggests personal data (for example name, phone, email, address, or
coordinates of homes), or whose values are mostly distinct, SHALL have no values listed.
Rows SHALL never be sent.

#### Scenario: Category values shared
- **WHEN** Curator cleans a table whose column `variety` has 6 distinct values
- **THEN** the model receives the 6 values of `variety` with their counts, and no row of
  the table

#### Scenario: Personal column not sampled
- **WHEN** a table has a column `farmer_name` with 8 distinct values
- **THEN** the description of `farmer_name` lists no values

### Requirement: Replies say what was shared
A data Trait that sent the model statistics of its tables SHALL end its reply with one line
saying what it shared: column names, types and statistics, and the columns whose values were
listed. *Join Data*, which sends only column names and types, and a data Trait that did not
call the model SHALL say nothing about sharing.

#### Scenario: Sharing line
- **WHEN** Validator answers after sharing the top values of `variety` and `site`
- **THEN** its reply ends with a line naming the model's input as column names, types and
  statistics, and values of `variety` and `site`

### Requirement: The model only chooses from fixed lists
A data Trait SHALL ask the model for a structured answer naming entries of a fixed catalogue
of checks or actions with their parameters, and SHALL ignore any entry that is not in the
catalogue, names a column the table does not have, or has invalid parameters, listing what
it ignored in the reply. The data Trait, not the model, SHALL compute every number, check
result and table it reports. When no AI model is set in Settings, a data Trait that needs
one fails with the message "Choose an AI model in Settings first."

#### Scenario: Invented check ignored
- **WHEN** the model's answer for Validate Data includes a check on a column `yeild` that
  the table does not have
- **THEN** that check is not run, and the reply lists it as ignored

### Requirement: Profile Data Trait
The Trait library SHALL contain *Profile Data*, which reports, for each table it reads, the
row and column counts, the number of duplicate rows, and for each column its type, missing
values (count and percentage), distinct values, and minimum and maximum when numeric or a
date. It SHALL use no AI model and send nothing outside the machine. Its reply is a short
text summary and a `table` component with one row per column.

#### Scenario: Profiling a field trial
- **WHEN** the user sends "@Profiler #field-trial.csv" for a file of 240 rows and 12
  columns with 3 duplicate rows
- **THEN** the reply says it has 240 rows, 12 columns and 3 duplicate rows, and shows a
  table with one row per column giving its type, missing values, distinct values and range

#### Scenario: Works without a model
- **WHEN** no AI model is set in Settings and the user asks Profiler to profile a file
- **THEN** Profiler answers normally

### Requirement: Validate Data Trait
The Trait library SHALL contain *Validate Data*, which runs, on each table it reads, the
default checks (no column is entirely empty; no row is duplicated) and the checks the model
chooses from this catalogue to match the user's message: not-null, unique key (one or more
columns), numeric range, allowed values, text pattern, and column type. Checks SHALL run
with pointblank.

#### Scenario: Rules from the message
- **WHEN** the user sends "@Validator #field-trial.csv plot_id must be unique and yield
  between 0 and 80"
- **THEN** the reply's table lists the default checks, a unique-key check on `plot_id` and
  a range check on `yield` from 0 to 80, each with its passed and failed rows

#### Scenario: Only defaults
- **WHEN** the message names no rule
- **THEN** only the default checks run

### Requirement: Validation results
*Validate Data*'s reply SHALL list every check run with its column, the rows that passed
and failed, and its result, as a `table` component, and say how many checks failed. It
SHALL attach pointblank's report as `<file>-validation.html`.

#### Scenario: Failed checks counted
- **WHEN** two of five checks fail
- **THEN** the reply says two checks failed, the table marks them, and
  `field-trial-validation.html` is attached

### Requirement: Clean Data Trait
The Trait library SHALL contain *Clean Data*, which applies to one table the cleaning
actions the model chooses from this list, in the order given: trim whitespace, normalise
missing-value codes to empty, change letter case, cast a column to a type, map values,
replace by a regular expression, drop duplicate rows, drop rows matching a condition, clip
to a range, fill missing values, rename columns, and sort. It SHALL save the result as a new
Asset named `<name>-cleaned.<ext>` in the input's format and SHALL NOT change the input.
Its reply lists each action applied with the number of cells or rows it changed, and shows
a preview of the cleaned table as a `table` component.

#### Scenario: Cleaning a field trial
- **WHEN** the user sends "@Curator #field-trial.csv fix the variety spellings and remove
  duplicate rows"
- **THEN** the reply lists a value mapping on `variety` and the dropped duplicates with
  their counts, `field-trial-cleaned.csv` is attached, and `field-trial.csv` is unchanged

### Requirement: Destructive cleaning is held back
*Clean Data* SHALL NOT apply an action that would remove more than half of the table's
rows, and its reply SHALL say which action was held back and why.

#### Scenario: Destructive action held back
- **WHEN** a chosen action would drop 70% of the rows
- **THEN** it is not applied, and the reply says which action was held back and why

### Requirement: Join Data Trait
The Trait library SHALL contain *Join Data*, which joins the first two tables it reads on
key columns, using the join type the user asks for (inner, left, right or outer; left by
default). The model chooses the keys and join type from the message and the two tables'
column names; it sees no values. When no AI model is set and the tables share exactly one
column name, that column is the key.

#### Scenario: Keys without a model
- **WHEN** no AI model is set and both tables have one shared column, `plot_id`
- **THEN** the tables are joined on `plot_id`

### Requirement: Join results
*Join Data* SHALL save the result as `<first>-joined.csv`. Its reply SHALL give the row
counts of both inputs and of the result, the number of keys in each table without a match,
and a preview of the result as a `table` component.

#### Scenario: Joining harvest to plots
- **WHEN** the user sends "@Linker join #harvest.csv to #plots.csv by plot_id"
- **THEN** the reply gives the row counts, the keys without a match in each table, and a
  preview, and `harvest-joined.csv` is attached

#### Scenario: Fewer than two tables
- **WHEN** the message references only one table
- **THEN** the reply fails with a message asking for two tables
