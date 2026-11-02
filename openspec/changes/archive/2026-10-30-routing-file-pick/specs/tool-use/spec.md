## MODIFIED Requirements

### Requirement: Prompt Traits know the Conversation's results
Every call of a prompt-based Trait SHALL tell the model the name and ID of each Asset and
the kind, author and ID of each Interactive Component of the Conversation, newest first, at
most 50 of each, marking the current message's files and the reply's picked file, which it
SHALL describe as the file the user probably means. It SHALL also tell the model each `$`
reference of the current message: its label, its component's kind and its component's ID.
It SHALL NOT include their content; the model reads content with the read tools.

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
  reads it and answers from its rows

#### Scenario: Referenced chart
- **WHEN** the user sends "@Scribe explain $Yield-by-variety"
- **THEN** the first request names that reference as a chart with its component's ID,
  without its data, and the model reads the chart with read-a-component before explaining
