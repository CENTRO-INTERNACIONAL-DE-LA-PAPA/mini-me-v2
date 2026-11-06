# project-overview Specification

## Purpose

The Project Overview: one read-only page per Project that says where the Project stands and
shows what its Conversations produced, so the user does not have to search Conversations
for results.

## Requirements

### Requirement: Overview header
The Overview SHALL show the meta line "Updated <time>" above the Project's name as its title.
`<time>` is the latest activity of any of its Conversations as a relative time. A Project
without Conversations SHALL show "No conversations yet".

#### Scenario: Project with three Conversations
- **WHEN** the user opens a Project with three Conversations, the latest active 2 hours ago
- **THEN** the Overview reads "Updated 2 h ago" above the
  Project's name

#### Scenario: New Project
- **WHEN** the user opens a Project that has no Conversations
- **THEN** the Overview reads "No conversations yet"

### Requirement: Summary written on request
The Overview SHALL have an "Update summary" button. Clicking it SHALL ask the AI model chosen
in Settings for a short paragraph on what the Project has found and what is pending, from the
text of the Project's messages. No model SHALL be called for a summary until the user clicks
the button.

#### Scenario: First summary
- **WHEN** the user clicks "Update summary" in a Project with Conversations
- **THEN** the button shows that the summary is being written, and the paragraph appears
  when the model answers

#### Scenario: Opening the Overview
- **WHEN** the user opens a Project's Overview
- **THEN** no model is called

### Requirement: The summary is kept in the Project
A written summary SHALL be stored in `project.sqlite` with the time it was written, and the
Overview SHALL show it with "Written <time>" until the user updates it again. A Project
without a summary SHALL show a line inviting the user to write one.

#### Scenario: Reopening the Project
- **WHEN** the user writes a summary, closes the app and opens the Project again
- **THEN** the same summary is shown with the time it was written

### Requirement: What the summary is written from
The summary's material SHALL be the content of the Project's messages, grouped by
Conversation with their titles, newest Conversations first, within the same size budget as a
prompt call's material; Conversations that do not fit SHALL be left out whole. File contents
and component data SHALL NOT be sent.

#### Scenario: Large Project
- **WHEN** the Project's messages exceed the size budget
- **THEN** the oldest Conversations are left out and the newest are sent whole

### Requirement: Summary failures
When a summary cannot be written (no model or key in Settings, the provider's error, a content
filter, or the sidecar unavailable), the Overview SHALL keep the previous summary and show the
reason, using the same messages as a failed reply.

#### Scenario: No model set
- **WHEN** the user clicks "Update summary" and Settings has no AI model
- **THEN** the Overview says to choose a model in Settings, and the previous summary stays

### Requirement: Summary request on the link
The core SHALL ask the sidecar for a summary with `summary.start`, payload
`{ summary_id, model: { provider, model }, material, kind }`, where `summary_id` is a new UUIDv7 and
`kind` is `overview` for the Overview's summary or `title` for a Conversation's title. The sidecar
SHALL get the provider's key with `secret.get` using `summary_id` as the `call_id`, and answer with
exactly one of `summary.done { summary_id, text }` and `summary.error { summary_id, error: { code,
message } }`.

#### Scenario: Summary written
- **WHEN** the core sends `summary.start` with a model whose key is saved
- **THEN** the sidecar answers `summary.done` with the summary's text

#### Scenario: Key missing
- **WHEN** the core sends `summary.start` and the provider has no key
- **THEN** the sidecar answers `summary.error` with code `secret_unavailable`

#### Scenario: A title
- **WHEN** the core sends `summary.start` with `kind` `title` and a Conversation's first message
- **THEN** the sidecar answers `summary.done` with a short title

### Requirement: Featured output
The Overview SHALL show the Project's featured component, drawn as in its reply, under the
summary, with the name of the Mini-Me that made it and a button to remove it from the
Overview. With no featured component the Overview SHALL show no featured block.

#### Scenario: A featured chart
- **WHEN** the user has featured Plotter's chart of yield by altitude
- **THEN** the Overview shows that chart, labelled Plotter, under the summary

#### Scenario: Removing it
- **WHEN** the user removes the featured chart from the Overview
- **THEN** the featured block disappears and the chart stays in its reply

### Requirement: Latest outputs
The Overview SHALL list the Project's outputs newest first: every Interactive Component in a
reply except approvals, and every Asset a Mini-Me saved. It SHALL show the first six, and a
"Show all" button SHALL show the rest. Uploaded Assets SHALL NOT be listed.

#### Scenario: Eight outputs
- **WHEN** a Project has five components and three Mini-Me files
- **THEN** the Overview shows the six newest, and "Show all" shows all eight

#### Scenario: Upload only
- **WHEN** the user uploaded a file and no Mini-Me has replied yet
- **THEN** Latest outputs is empty and says that Mini-Mes' outputs will appear there

### Requirement: Output cards
Each output SHALL be a card with a thumbnail for its kind (table, chart, papers, theories,
datasets or file) tinted in the colour of the Mini-Me that made it with a bottom border in its solid
colour, the output's title, and "From <Conversation title>". Clicking a card SHALL open
its Conversation and scroll to the reply it came from.

#### Scenario: Curator's cleaned file
- **WHEN** Curator saved `trial-cleaned.csv` in "Huancayo 2025 trial data"
- **THEN** its card is tinted in Curator's colour and reads "trial-cleaned.csv" and
  "From Huancayo 2025 trial data"

#### Scenario: Opening a card
- **WHEN** the user clicks a chart's card
- **THEN** its Conversation opens scrolled to the reply that holds the chart

#### Scenario: Datasets CIP's Archivist found
- **WHEN** CIP's Archivist's reply showed 213 matching datasets
- **THEN** its card reads "213 datasets" with the Datasets icon

### Requirement: Link to Files
The Latest outputs section SHALL have an "Open Files →" link that opens the Project's Files
screen.

#### Scenario: Open Files
- **WHEN** the user clicks "Open Files →"
- **THEN** the Files screen of the same Project opens

### Requirement: Overview data stays in the Project
The summary and the featured component SHALL be stored only in the Project's
`project.sqlite`, so Project-folder confinement holds: the Overview reads and writes no other
file.

#### Scenario: Two Projects
- **WHEN** the user features a chart in one Project
- **THEN** another Project's Overview is unchanged

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
