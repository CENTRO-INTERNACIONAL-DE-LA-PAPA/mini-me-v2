## MODIFIED Requirements

### Requirement: Prompt Traits know the Conversation's results
Every call of a prompt-based Trait SHALL tell the model the name and ID of each Asset and
the kind, author and ID of each Interactive Component of the Conversation, newest first, at
most 50 of each, marking the current message's files, the
reply's picked file, which it SHALL describe as the file the user probably means, and the
reply's picked component, which it SHALL describe as the component the user probably means. It
SHALL NOT include their content; the model reads content with the read tools.

#### Scenario: Referenced file
- **WHEN** the user sends "@Scribe summarize #notes.txt"
- **THEN** the first request names `notes.txt` and its ID as a file of the message, without
  its content, and the model reads it before summarizing

#### Scenario: Picked file
- **WHEN** the user sends "@Scribe summarize the field notes" and Jev picks
  `field-notes.txt`
- **THEN** the first request lists `field-notes.txt` marked as the file the user probably
  means, without its content

#### Scenario: Earlier table
- **WHEN** the user sends "@Assistant what is in the third row of the last table?" without
  a reference
- **THEN** the first request lists the newest `table` component with its ID, and the model
  reads it, then its source file, and answers from its rows

#### Scenario: Referenced chart
- **WHEN** the user sends "@Scribe explain the yield by variety chart"
- **THEN** the first request lists the chart component with its ID, without its data, and the
  model reads the chart with read-a-component before explaining

#### Scenario: Picked component
- **WHEN** the user sends "@Plotter make that chart a bar chart" and Jev picks the chart
  "Yield by variety"
- **THEN** the first request lists that chart marked as the component the user probably
  means, without its data

## ADDED Requirements

### Requirement: Likely tools in the request
When a call's `context.tools` is not empty, a prompt-based Trait's model request SHALL name
those tools as likely useful, in their order. The model SHALL still be offered every tool, and
an empty `context.tools` SHALL add nothing to the request.

#### Scenario: Hint
- **WHEN** a call's `context.tools` is `["show_table", "save_file"]`
- **THEN** its first request says show_table and save_file are likely useful, and the model is
  offered every tool

#### Scenario: No hint
- **WHEN** a call's `context.tools` is empty
- **THEN** its first request names no likely tools
