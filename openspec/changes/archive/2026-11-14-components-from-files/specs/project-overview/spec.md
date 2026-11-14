## MODIFIED Requirements

### Requirement: Latest outputs
The Overview SHALL list the Project's outputs newest first: every Interactive Component in a
reply except approvals, and every Asset a Mini-Me saved that is not hidden. It SHALL show the
first six, and a "Show all" button SHALL show the rest. Uploaded Assets SHALL NOT be listed.

#### Scenario: Eight outputs
- **WHEN** a Project has five components and three Mini-Me files
- **THEN** the Overview shows the six newest, and "Show all" shows all eight

#### Scenario: Upload only
- **WHEN** the user uploaded a file and no Mini-Me has replied yet
- **THEN** Latest outputs is empty and says that Mini-Mes' outputs will appear there

#### Scenario: Theories and their hidden file
- **WHEN** Theorist's reply showed theories saved as a hidden `theory-store.json`
- **THEN** Latest outputs lists the theories once, and not `theory-store.json`

### Requirement: Names marked in the summary
The model SHALL be asked to write each file it names in the summary as `[name]()`, with the
name as the Conversations write it. Tables and charts SHALL NOT be marked. The summary SHALL be
stored as written.

#### Scenario: A file
- **WHEN** the model names `field-trial-cleaned.csv` in the summary
- **THEN** the stored summary holds `[field-trial-cleaned.csv]()`

### Requirement: Summary pills
The Overview SHALL show each marked name that is a file of the Project as the same `#` chip as
a reference in a sent message. Clicking a file pill SHALL open the file. Any other marked name
SHALL show as plain text.

#### Scenario: Opening a chart
- **WHEN** an older summary marks the chart title `[Yield by variety]()`
- **THEN** it shows as plain text, not as a pill

#### Scenario: A deleted file
- **WHEN** a file the summary names has been deleted
- **THEN** the summary shows its name as plain text

#### Scenario: A summary written before marks
- **WHEN** the Project's summary was written before names were marked
- **THEN** it shows as plain text, as before
