# Spec Delta

## ADDED Requirements

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
