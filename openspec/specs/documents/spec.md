# documents Specification

## Purpose
Defines documents: Quarto Markdown files in a Project that Mini-Mes write and the user opens,
edits and exports as PDF in the document view, and the Report panel that starts them from a
Conversation.

## Requirements

### Requirement: Documents are Quarto files in the Project
A document SHALL be an Asset of the Project whose name ends in `.qmd`, holding Quarto Markdown:
a YAML header with its `title` and, when known, its `author`, then its body. Keys of the header
the app does not use SHALL be kept unchanged when the document is saved.

#### Scenario: A document on disk
- **WHEN** the user creates a document titled "Huancayo 2025 report"
- **THEN** the Project's assets folder holds a `.qmd` file whose YAML header has
  `title: Huancayo 2025 report`, and Files lists it

#### Scenario: Opened elsewhere
- **WHEN** the `.qmd` file is opened in RStudio
- **THEN** it reads as an ordinary Quarto document

### Requirement: The Report panel
A Conversation SHALL offer a Report panel, titled "Report" with the subtitle "Choose how to
start", with three ways to begin: Draft from this conversation, Start blank, and Open from
Files.

#### Scenario: Opening the panel
- **WHEN** the user picks Report in a Conversation's tool switch
- **THEN** the panel shows Draft from this conversation, Start blank and Open from Files

### Requirement: Drafting from a Conversation
Draft from this conversation SHALL show the Mini-Mes that replied in the Conversation and a
"Draft report" button. Clicking it SHALL create a document titled after the Conversation, with
the user's name as author, open it, and fill its body with a report Scribe drafts from the
Conversation's messages as the text arrives. Nothing SHALL be added to the Conversation.

#### Scenario: Drafting
- **WHEN** Curator and Plotter have replied in "Trial design" and the user clicks Draft report
- **THEN** a document titled "Trial design" opens, the panel had shown Curator's and Plotter's
  avatars, and the report appears in the source as Scribe writes it, with no new message in the
  Conversation

#### Scenario: Nothing to draft from
- **WHEN** the Conversation has no reply from a Mini-Me, or a reply is running
- **THEN** Draft report cannot be clicked

### Requirement: While Scribe drafts
While the draft is written, the source SHALL show "Scribe is drafting…" with Scribe's avatar
and a Stop button, and SHALL NOT be editable. When the draft ends, is stopped, or the document
is closed, the text written so far SHALL be saved to the document, the source SHALL become
editable and the preview SHALL be rendered. A draft that fails SHALL say why and keep what was written.

#### Scenario: Stopping a draft
- **WHEN** the user clicks Stop after two sections have appeared
- **THEN** drafting stops, the two sections are saved in the `.qmd` file, and the source can
  be edited

#### Scenario: No AI model
- **WHEN** no AI model is set in Settings and the user clicks Draft report
- **THEN** the document opens with only its header, and the view says to choose an AI model in
  Settings

### Requirement: Draft requests to the sidecar
The core SHALL ask for a draft with `draft.start { draft_id, model: { provider, model },
title, material }`, `material` being the Conversation's messages within the history budget. The
sidecar SHALL get the key with `secret.get` using `draft_id` as the `call_id`, stream
`draft.delta { draft_id, text }`, and end with exactly one of `draft.done { draft_id }` and
`draft.error { draft_id, error: { code, message } }`. `draft.cancel { draft_id }` SHALL stop it.

#### Scenario: Draft written
- **WHEN** the core sends `draft.start` with a model whose key is saved
- **THEN** the sidecar answers with `draft.delta` frames and then `draft.done`

#### Scenario: Cancelled
- **WHEN** the core sends `draft.cancel` while deltas are arriving
- **THEN** the sidecar stops calling the model and answers `draft.done`

### Requirement: Starting a blank document
Start blank SHALL create a document named "Untitled document.qmd", titled "Untitled document",
with the user's name as author when they have one, and open it in the document view.

#### Scenario: Blank document
- **WHEN** the user's name is "Ana Pérez" and they click Start blank
- **THEN** a document titled "Untitled document" by Ana Pérez opens, and Files lists it

### Requirement: Opening a document from Files
Open from Files SHALL list the Project's documents, most recently edited first, each with its
name and when it was last edited, its tile in the colours of the Mini-Me whose reply it is
attached to, or neutral otherwise. Clicking one SHALL open it in the document view.

#### Scenario: Choosing a document
- **WHEN** the Project holds a document Assistant wrote in a reply and one the user started
- **THEN** both are listed, Assistant's tile in Assistant's colours and the other neutral, and
  clicking either opens it

### Requirement: The document view
A document SHALL open across the whole main sheet under an editor header: a back link to the
view it was opened from, its title from the YAML header, a status line "Draft · <Project> ·
edited <time>", a Comments button, Export PDF, and below them the source and the preview side by
side. The Comments button SHALL show or hide the Comments sheet beside the main sheet.
The back link SHALL return to the view the document was opened from.

#### Scenario: Opening from a Conversation
- **WHEN** the user opens a document from the Report panel of "Trial design" and clicks the
  "Trial design" back link
- **THEN** "Trial design" is shown again

#### Scenario: Showing the comments
- **WHEN** the user clicks Comments
- **THEN** the Comments sheet appears beside the main sheet, and clicking Comments again hides
  it

### Requirement: Editing the source
The document SHALL be edited as its Quarto source, the whole file including its YAML header,
with Markdown highlighting, line wrapping and undo; whatever is typed SHALL be saved exactly as
typed. Buttons SHALL put bold or italic marks around the selection and start the selected lines
with a heading, quote or list marker, and take them off again.

#### Scenario: Bold text
- **WHEN** the user selects "212" and clicks Bold
- **THEN** the source reads `**212**`

#### Scenario: Quarto the app does not know
- **WHEN** the user types a `::: {.callout-note}` block
- **THEN** it is saved exactly as typed

#### Scenario: Renaming
- **WHEN** the user changes `title:` in the YAML header to "Huancayo 2025: replicates"
- **THEN** the header shows the new title; the file's name does not change

### Requirement: The preview
The preview SHALL show the document's pages as Export PDF would make them. It SHALL be rendered
when the document opens, when a draft ends, and when the user clicks Render, from the source as
it is then. While the source differs from what was rendered, the preview SHALL say so. A
failed render SHALL say why and keep the last pages.

#### Scenario: Rendering after an edit
- **WHEN** the user adds a table to the source
- **THEN** the preview says the source changed, and after Render it shows the table

### Requirement: Edits are saved automatically
Edits to the source SHALL be saved to the document's file shortly after typing pauses, and when
the document view is closed, without a save button. The status line SHALL show when it was last edited, and
a save that fails SHALL be reported in the view.

#### Scenario: Closing right after typing
- **WHEN** the user types a sentence and closes the document at once
- **THEN** the sentence is in the `.qmd` file

### Requirement: Saving stays in the Project
The Rust core SHALL save a document only to an existing `.qmd` Asset of the open Project,
writing its file inside the Project folder through a temporary file, so a failed save leaves
the previous version whole.

#### Scenario: Not a document
- **WHEN** a save is asked for an Asset named `field-trial.csv`
- **THEN** it is refused and the file is unchanged

### Requirement: Exporting a PDF
Export PDF SHALL save the document's current source as a PDF Asset named after the document
(`<name>.pdf`), listed in Files, and offer to open it. Headings, paragraphs, emphasis,
links, quotes, lists, code blocks and tables SHALL be laid out; the text inside other Quarto
blocks SHALL appear as plain paragraphs. Code cells SHALL be shown as code and never run. A
failed export SHALL say why and save nothing.

#### Scenario: Export
- **WHEN** the user exports "Huancayo 2025 report.qmd"
- **THEN** Files lists "Huancayo 2025 report.pdf" and the view offers to open it

#### Scenario: A Python cell
- **WHEN** the document holds a ```` ```{python} ```` cell and is exported
- **THEN** the PDF shows the cell's code and no code runs

#### Scenario: A callout
- **WHEN** the document holds a `::: {.callout-note}` block and is exported
- **THEN** the PDF shows the callout's text as a plain paragraph

#### Scenario: Sidecar not ready
- **WHEN** the user exports while the sidecar is not ready
- **THEN** the export fails with a message to try again when Mini-Me is ready

### Requirement: Preview requests to the sidecar
The core SHALL ask the sidecar for a preview with `document.preview { preview_id, source }`.
The sidecar SHALL answer with `document.previewed { preview_id, pages }`, `pages` one SVG
image per page, made by the same conversion as the PDF, or `document.preview_error
{ preview_id, error: { code, message } }`. The sidecar SHALL read and write no file.

#### Scenario: Preview frames
- **WHEN** the user clicks Render on a three-page document
- **THEN** the core sends `document.preview` and the preview shows the three pages of
  `document.previewed`

### Requirement: Export requests to the sidecar
The core SHALL ask the sidecar for a PDF with `document.export` `{ export_id, name, source }`,
`source` being the document's text. The sidecar SHALL answer with `document.exported`
`{ export_id, data }`, `data` the PDF base64-encoded, or `document.export_error`
`{ export_id, error: { code, message } }`. The sidecar SHALL read and write no file.

#### Scenario: Export frames
- **WHEN** the user exports a document
- **THEN** the core sends `document.export`, and on `document.exported` stores the PDF as an
  Asset of the Project
