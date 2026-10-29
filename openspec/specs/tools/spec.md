# tools Specification

## Purpose
Defines the tools: actions a Trait can take while it runs, such as saving a file, showing a
table or reading the Conversation's results, taken either by its adapter's code or by an
AI model the adapter offers them to.

## Requirements

### Requirement: Tools are actions taken through the core
A tool SHALL act only through the requests a Trait call can make to the core
(`asset.write`, `asset.read`, `component.add`, `conversation.results`, `component.read`). A
tool SHALL hold no state between calls, and its results SHALL be what the core returned.

#### Scenario: Ended reply
- **WHEN** a tool runs after its reply was stopped
- **THEN** the core refuses its request with `call_not_active`, and nothing is saved or
  shown

### Requirement: Tool failures are results
When a tool's arguments are invalid or the core refuses its request, the tool SHALL fail
with a message saying what was wrong, and SHALL NOT save or show anything for that call.
The failure SHALL NOT end the reply by itself.

#### Scenario: Refused name
- **WHEN** a tool saves a file named `../../notes.txt`
- **THEN** the core refuses the name with `invalid_input`, nothing is written, and the tool
  fails saying to use a plain file name

### Requirement: Adapters act through the tools
An adapter SHALL save files, show Interactive Components and read files only through the
tools, never through `asset.write`, `component.add` or `asset.read` directly. The data
Traits SHALL read their tables through the read-a-table tool. An adapter that runs fixed
code SHALL use exactly the tools its Traits list. The data and Asta Traits' replies, files
and components SHALL be the same as when they acted on their own.

#### Scenario: Cleaned table
- **WHEN** Curator cleans `field-trial.csv`
- **THEN** `field-trial-cleaned.csv` is saved by the save-a-file tool and the tables are
  shown by the show-a-table tool, and the reply looks as it did before

### Requirement: Saving a file
The save-a-file tool SHALL take a file name, a media type and the file's bytes, at most
32 MiB. The file SHALL be saved through `asset.write`, so it is attached to the reply, and
the tool SHALL return the saved Asset's ID and name. A larger file SHALL fail without
anything being written.

#### Scenario: Validation report
- **WHEN** Validator saves `field-trial-validation.html` as `text/html`
- **THEN** it is attached to the reply as a generated Asset

### Requirement: Saving a text file for a model
The form of save-a-file offered to a model SHALL take a file name and text content. The
name SHALL end in `.csv`, `.tsv`, `.txt`, `.md` or `.json`, and the content SHALL be at most
2 MiB as UTF-8; the media type SHALL follow the extension.

#### Scenario: Sample CSV
- **WHEN** a model saves `sample-yields.csv` with a header and 50 rows
- **THEN** `sample-yields.csv` is attached to the reply as a generated Asset of type
  `text/csv`, and the model gets its Asset ID

#### Scenario: Unsupported extension
- **WHEN** a model asks to save `report.xlsx`
- **THEN** the tool fails saying only CSV, TSV, TXT, Markdown and JSON files can be saved,
  and nothing is written

### Requirement: One show tool per component kind
Each Interactive Component kind a Trait can add SHALL have its own show tool: show-a-table
(`table`), show-a-chart (`chart`), show-papers (`paper-sources`) and show-theories
(`theories`). A Trait SHALL be able to show only the kinds whose tools its adapter uses;
there SHALL be no tool that shows any kind. Each tool SHALL add its component through
`component.add`, with version 1, the data and a plain-text alternative, and return its ID.

#### Scenario: Paper list
- **WHEN** Find Papers shows its results with show-papers
- **THEN** the reply shows the paper list, as before

#### Scenario: Assistant cannot show theories
- **WHEN** Assistant answers a request about theories
- **THEN** it can show a table but not a `theories` component, since its adapter offers
  only show-a-table

### Requirement: Refused components fall back to text
When the core refuses a component, its show tool SHALL fail with the core's code, so the
adapter can write the component's text alternative in the reply instead.

#### Scenario: Refused chart
- **WHEN** the core refuses a `chart` component as invalid
- **THEN** show-a-chart fails with `invalid_component`, and Plot writes the chart's text
  instead

### Requirement: Reading a table
The read-a-table tool SHALL read a CSV, TSV or Excel Asset of the Project through
`asset.read` and parse it as the data Traits do, inferring column types and reading the
Excel sheet named in the message. A file larger than 100 MiB or that cannot be parsed
SHALL fail with the data Traits' error codes (`table_too_large`, `table_unreadable`).

#### Scenario: Excel sheet
- **WHEN** a message says "use 2025" and references `harvest.xlsx` with sheets 2024 and
  2025
- **THEN** the tool reads the sheet 2025

### Requirement: Saved files stay in the Project
The save-a-file tool SHALL write only through `asset.write`. It SHALL never receive or use a
file path, so a saved file always lands in the call's Project folder under the core's
confinement check, whatever name it is given.

#### Scenario: Name with a separator
- **WHEN** the tool is asked to save `results/summary.md`
- **THEN** the core refuses the name, and nothing is written inside or outside the Project

### Requirement: Tables are built the same way everywhere
Every `table` component SHALL be built by the show-a-table tool, whether an adapter shows
one of its results or a model shows rows or a file, so column types, the 500-row preview
and the 20-row text are the same for every Trait.

#### Scenario: Same file, two Traits
- **WHEN** Assistant shows `harvest.csv` as a table and Profiler shows a table of the same
  file's columns
- **THEN** both type `planted` as `date` and `yield_t_ha` as `number`

### Requirement: Showing a table from given rows
The show-a-table tool SHALL accept a title, columns (each a name and a type: `number`,
`text`, `date` or `boolean`) and at most 500 rows, each with one value per column or
`null` and each value matching its column's type. It SHALL add a `table` version 1
component with that data and a plain-text version of its first 20 rows.

#### Scenario: Given rows
- **WHEN** the tool shows a table of 3 columns and 50 rows
- **THEN** the reply gets a `table` component with those columns and rows

#### Scenario: Row of the wrong length
- **WHEN** a row has 2 values for 3 columns
- **THEN** the tool fails naming the row, and no component is added

#### Scenario: Too many rows
- **WHEN** the tool is given 800 rows
- **THEN** it fails saying the limit is 500 rows, and no component is added

### Requirement: Showing a table from an Asset
The show-a-table tool SHALL also accept the ID of a CSV, TSV or Excel Asset of the Project
instead of rows. It SHALL read the Asset, infer column types as the data Traits do, and add
a `table` component with up to 500 rows; for a longer table, `total_rows` gives the full
count and `source` names the Asset.

#### Scenario: File just saved
- **WHEN** a file `sample-yields.csv` was just saved and the tool shows a table from its
  Asset ID
- **THEN** the reply gets a `table` component of the file's rows, with typed columns

#### Scenario: Not a table
- **WHEN** the tool is asked to show a table from a PDF Asset
- **THEN** it fails saying only CSV, TSV and Excel files can be shown as tables

### Requirement: Reading a file
The read-a-file tool SHALL read one Asset of the call's Conversation by ID, from an
optional start. A CSV, TSV or Excel file SHALL be returned as its columns and up to 500
rows from the start row, with the total row count. Another UTF-8 file SHALL be returned as
up to 100,000 characters from the start character, with the total length. A file of any
other kind SHALL fail as unreadable.

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

### Requirement: Tools show what they are doing
While a tool runs, it SHALL report progress on the reply: "Saving <name>", "Showing a
table", "Reading <name>" or "Reading a component".

#### Scenario: Saving
- **WHEN** the save-a-file tool saves `sample-yields.csv`
- **THEN** the reply shows "Saving sample-yields.csv" until the tool finishes

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

### Requirement: Writing a document
The write-a-document tool (`write_document`, with a form for models) SHALL take a `title` and
a Quarto Markdown `body`, save them as a new `.qmd` Asset named after the title with a YAML
header holding the title, attach it to the reply and add a `document` component for it. The
body SHALL be at most 2 MiB; a tool result SHALL give the new Asset's ID.

#### Scenario: Scribe writes a report
- **WHEN** Scribe calls write-a-document with the title "Huancayo 2025 report" and a body
- **THEN** "Huancayo 2025 report.qmd" is attached to Scribe's reply and a document card for it
  shows below the reply

#### Scenario: A title that is not a file name
- **WHEN** the title is "Trials: 2026/27"
- **THEN** the document is saved under a name without `:` or `/`, and keeps the title in its
  header

### Requirement: Suggesting an edit
The suggest-an-edit tool (`suggest_edit`, with a form for models) SHALL take the replacement
`text` for the passage of the comment thread the call answers, at most 64 KiB, and add a
`suggestion` component to the reply. The Rust core SHALL complete the component with the
document and the passage's text as it is when the suggestion is made. Outside a comment thread
the tool SHALL fail with `not_in_thread`. A tool result SHALL give the new component's ID. The
tool SHALL NOT change the document; only the user's Accept does.

#### Scenario: Scribe suggests a shorter passage
- **WHEN** Scribe, answering "@Scribe make this shorter", calls suggest-an-edit with "Yield fell
  above 3,800 m."
- **THEN** a suggestion with that text, based on the passage as it read then, is added to
  Scribe's reply, and the document is unchanged

#### Scenario: Outside a thread
- **WHEN** a Trait call in a Conversation calls suggest-an-edit
- **THEN** the call fails with `not_in_thread` and no component is added
