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
An adapter SHALL save files, show tables and charts and read files only through the tools,
never through `asset.write`, `component.add` or `asset.read` directly. The data Traits SHALL
read their tables through the read-a-table tool. An adapter that runs fixed code SHALL declare
the tools its code uses. A provider adapter (Find Papers, Theorize, Search CIP
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

### Requirement: Tools show what they are doing
While a tool runs, it SHALL report progress on the reply: "Saving <name>", "Showing a
table", "Reading <name>" or "Reading a component".

#### Scenario: Saving
- **WHEN** the save-a-file tool saves `sample-yields.csv`
- **THEN** the reply shows "Saving sample-yields.csv" until the tool finishes

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

### Requirement: Suggesting a change
The suggest tool (`suggest`, with a form for models) SHALL take a document's Asset ID, the
passage to replace (`find`) and the new text (`text`, empty to remove the passage). The core
SHALL add a waiting suggestion by the Mini-Me whose reply made the call, from a Conversation or a
comment thread, on any document of the Project, and the tool SHALL return its ID. The document's
file SHALL NOT change.

#### Scenario: From the chat
- **WHEN** Scribe, answering "make the methods in Trial report shorter", calls suggest on
  "Trial report.qmd" with a sentence that occurs once
- **THEN** a waiting suggestion by Scribe is added on that sentence, and the file is unchanged

#### Scenario: From a thread
- **WHEN** Scribe, answering "too long" in a thread, calls suggest on the thread's sentence
- **THEN** a waiting suggestion by Scribe is added on that sentence, as from the chat

### Requirement: Checks on a suggestion
The tool SHALL send the request `document.suggest`, params `{ asset_id, find, text }`, whose
result is `{ suggestion_id }`. The core SHALL refuse it, adding nothing, with `not_a_document`
unless the Asset is a `.qmd` document of the Project; with `passage_not_found` or
`passage_not_unique` unless `find` occurs exactly once in the saved document; and with
`invalid_input` when `find` is empty or `text` is larger than 64 KiB. The document SHALL be read
through the Project-folder confinement check.

#### Scenario: A quote that occurs twice
- **WHEN** a call suggests a change to "Huancayo", which occurs three times
- **THEN** the call fails with `passage_not_unique`, and nothing is added

#### Scenario: Not a document
- **WHEN** a call suggests a change to `field-trial.csv`
- **THEN** the call fails with `not_a_document`

### Requirement: Events of a suggestion
Adding a suggestion SHALL be stored in the Project's database without an event. A reply in a
Conversation that adds a suggestion SHALL get a `component.added` with the document's `document`
card, unless the reply already shows that document's card. A reply in a comment thread SHALL get
no card.

#### Scenario: Two suggestions from one reply
- **WHEN** Scribe's reply in "Trial design" suggests two changes to "Trial report.qmd"
- **THEN** the reply shows one "Trial report" card
