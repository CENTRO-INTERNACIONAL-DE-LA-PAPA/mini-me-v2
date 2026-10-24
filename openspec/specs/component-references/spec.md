# component-references Specification

## Purpose
Referencing a whole table or chart Interactive Component in a message with `$`, so that
every Trait works on exactly the component the user means.

## Requirements

### Requirement: Component names
A table's name SHALL be the file name of its `source` without the extension. A table that
comes from no file SHALL be named after its `title`, without a `.csv`, `.tsv` or `.xlsx`
extension, and one with no title "table". A chart SHALL be named after its `title`, and one
with no title "chart". Characters other than letters, digits, `-`, `_` and `.` SHALL become
`-`.

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

### Requirement: Repeated names
When an earlier table or chart of the same Conversation already has a component's name, the
component SHALL take the name with `-2`, `-3` and so on, counting tables and charts together.

#### Scenario: Second table with a title
- **WHEN** a table titled "Columns of trial.csv" is the second table of the Conversation
  with that title
- **THEN** its name is `Columns-of-trial-2`

#### Scenario: Table and chart with one name
- **WHEN** a chart titled "plots" follows a table named `plots`
- **THEN** the chart's name is `plots-2`

### Requirement: Reference labels
A reference's label SHALL be `$` followed by the component's name, for example
`$field-trial-cleaned`.

#### Scenario: Label of a chart
- **WHEN** the user references the chart named `Yield-by-variety`
- **THEN** its label is `$Yield-by-variety`

### Requirement: Reference button
Each `table` and `chart` component of a reply SHALL show a reference button in its header,
an icon button whose accessible name says it references the component in the message.
Clicking it SHALL append the component's `$` chip to the end of the open Conversation's
composer text, as a picked reference, without changing the text already there. Each click
SHALL append its own chip.

#### Scenario: Referencing a table
- **WHEN** the composer holds "Plot this" and the user clicks the reference button of the
  table `field-trial-cleaned`
- **THEN** the composer holds "Plot this" followed by the chip `$field-trial-cleaned`, which
  acts as one block like a picked `#` file

#### Scenario: Referencing a chart
- **WHEN** the composer is empty and the user clicks the reference button of the chart
  `Yield-by-variety`
- **THEN** the composer holds the chip `$Yield-by-variety`, which Backspace removes

### Requirement: The $ list
Typing `$` in the composer SHALL list the table and chart components of the open
Conversation by name, newest first, filtered by the text typed after `$`, each marked as a
table or a chart. Picking one SHALL insert a reference to it as a chip. With no table or
chart in the Conversation, no list SHALL be shown.

#### Scenario: Picking a table
- **WHEN** the user types "$fie" and picks `field-trial-cleaned`
- **THEN** the composer shows the chip `$field-trial-cleaned`

#### Scenario: No tables or charts
- **WHEN** the Conversation has no table or chart component and the user types "$"
- **THEN** no list is shown and "$" stays plain text

### Requirement: The core checks a reference
When a message is sent, the core SHALL reject a `component` Text Component whose component
is not a `table` or `chart` of the same Conversation. A rejected message SHALL NOT be
persisted.

#### Scenario: Approval instead of a table
- **WHEN** a message's `component` Text Component names an approval component
- **THEN** the message is rejected and nothing is persisted

#### Scenario: Table of another Conversation
- **WHEN** a message's `component` Text Component names a table of another Conversation
- **THEN** the message is rejected and nothing is persisted

### Requirement: References in sent messages
A sent message SHALL show each `$` reference as a chip with its label, like a `#` file chip.

#### Scenario: Sent reference
- **WHEN** the user sends "@Plotter plot $field-trial-cleaned"
- **THEN** the sent message shows `$field-trial-cleaned` as a chip
