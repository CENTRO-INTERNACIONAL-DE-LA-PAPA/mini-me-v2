# Spec Delta

## ADDED Requirements

### Requirement: Names marked in the summary
The model SHALL be asked to write each file, table or chart it names in the summary as
`[name]()`, with the name as the Conversations write it. The summary SHALL be stored as written.

#### Scenario: A file
- **WHEN** the model names `field-trial-cleaned.csv` in the summary
- **THEN** the stored summary holds `[field-trial-cleaned.csv]()`

### Requirement: Summary pills
The Overview SHALL show each marked name that is a file of the Project, or the title of a
`table` or `chart` in the Overview's outputs, as the same `#` or `$` chip as a reference in a
sent message. Clicking a file pill SHALL open the file, and clicking a `table` or `chart` pill
SHALL open its Conversation at the reply that shows it. Any other marked name SHALL show as
plain text.

#### Scenario: Opening a chart
- **WHEN** the user clicks the `$Yield-by-variety` pill in the summary
- **THEN** the Conversation opens at the reply that shows the chart

#### Scenario: A deleted file
- **WHEN** a file the summary names has been deleted
- **THEN** the summary shows its name as plain text

#### Scenario: A summary written before marks
- **WHEN** the Project's summary was written before names were marked
- **THEN** it shows as plain text, as before
