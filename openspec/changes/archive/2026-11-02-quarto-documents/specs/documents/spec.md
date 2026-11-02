# Spec Delta

## ADDED Requirements

### Requirement: Document work needs Quarto
Creating, drafting, opening, editing, previewing, exporting and commenting on a document SHALL be
available only while a Quarto that meets the `quarto-rendering` requirements is found. Without one,
each of these actions SHALL be disabled, and the document view SHALL say that Quarto is needed and
link to Quarto's install page. Documents already in the Project SHALL still be listed in Files.

#### Scenario: No Quarto
- **WHEN** no Quarto is found and the user clicks Start blank
- **THEN** no document is created, and the view says Quarto is needed to edit documents

#### Scenario: Existing document without Quarto
- **WHEN** no Quarto is found and the user clicks "Huancayo 2025 report.qmd" in Files
- **THEN** the document view opens showing the Quarto notice, and its source cannot be edited

#### Scenario: Quarto installed later
- **WHEN** the user installs Quarto and clicks Check again in the Quarto notice
- **THEN** the document is editable and the preview renders

## MODIFIED Requirements

### Requirement: The Report panel
A Conversation SHALL offer a Report panel, titled "Report" with the subtitle "Choose how to start",
with three ways to begin: Draft from this conversation, Start blank, and Open from Files. Without
Quarto, Draft from this conversation and Start blank SHALL be disabled, and the panel SHALL say that
Quarto is needed.

#### Scenario: Opening the panel
- **WHEN** the user picks Report in a Conversation's tool switch
- **THEN** the panel shows Draft from this conversation, Start blank and Open from Files

#### Scenario: Without Quarto
- **WHEN** the user opens the panel with no Quarto found
- **THEN** Draft from this conversation and Start blank are disabled, and Open from Files still lists
  the Project's documents

### Requirement: Drafting from a Conversation
Draft from this conversation SHALL show the Mini-Mes that replied in the Conversation and a "Draft
report" button. Clicking it SHALL create a document titled after the Conversation, with the user's
name as author, open it, and fill its body with a report Scribe drafts from the Conversation's
messages as the text arrives. Nothing SHALL be added to the Conversation.

#### Scenario: Drafting
- **WHEN** Curator and Plotter have replied in "Trial design" and the user clicks Draft report
- **THEN** a document titled "Trial design" opens, the panel had shown Curator's and Plotter's
  avatars, and the report appears in the source as Scribe writes it, with no new message in the
  Conversation

#### Scenario: Nothing to draft from
- **WHEN** the Conversation has no reply from a Mini-Me, or a reply is running
- **THEN** Draft report cannot be clicked

#### Scenario: Without Quarto
- **WHEN** no Quarto is found
- **THEN** Draft report cannot be clicked

### Requirement: Starting a blank document
Start blank SHALL create a document named "Untitled document.qmd", titled "Untitled document", with
the user's name as author when they have one, and open it in the document view. It SHALL be
available only while Quarto is found.

#### Scenario: Blank document
- **WHEN** the user's name is "Ana Pérez" and they click Start blank
- **THEN** a document titled "Untitled document" by Ana Pérez opens, and Files lists it

### Requirement: Opening a document from Files
Open from Files SHALL list the Project's documents, most recently edited first, each with its name and
when it was last edited, its tile in the colours of the Mini-Me whose reply it is attached to, or
neutral otherwise. Clicking one SHALL open it in the document view, which SHALL show the Quarto notice
when no Quarto is found.

#### Scenario: Choosing a document
- **WHEN** the Project holds a document Assistant wrote in a reply and one the user started
- **THEN** both are listed, Assistant's tile in Assistant's colours and the other neutral, and
  clicking either opens it

### Requirement: The document view
A document SHALL open across the whole main sheet under an editor header: a back link to the view it
was opened from, its title from the YAML header, a status line "Draft · <Project> · edited <time>", a
Comments button, Export PDF, and below them the source and the preview side by side. The Comments
button SHALL show or hide the Comments sheet beside the main sheet. The back link SHALL return to the
view the document was opened from. Without Quarto, the source and the preview SHALL be replaced by the
Quarto notice, and Export PDF SHALL be disabled.

#### Scenario: Opening from a Conversation
- **WHEN** the user opens a document from the Report panel of "Trial design" and clicks the "Trial
  design" back link
- **THEN** "Trial design" is shown again

#### Scenario: Showing the comments
- **WHEN** the user clicks Comments
- **THEN** the Comments sheet appears beside the main sheet, and clicking Comments again hides it

#### Scenario: Without Quarto
- **WHEN** no Quarto is found and the user opens a document
- **THEN** the view shows the Quarto notice in place of the source and preview, and Export PDF is
  disabled

### Requirement: The preview
The preview SHALL show the document's pages as Export PDF would make them, rendered by Quarto as
described in `quarto-rendering`. It SHALL be rendered when the document opens, when a draft ends, and
when the user clicks Render, from the source as it is then. While the source differs from what was
rendered, the preview SHALL say so. A failed render SHALL say why and keep the last pages.

#### Scenario: Rendering after an edit
- **WHEN** the user adds a table to the source
- **THEN** the preview says the source changed, and after Render it shows the table

#### Scenario: Rendering while Quarto works
- **WHEN** the user clicks Render
- **THEN** the preview shows that it is rendering until the pages are ready

### Requirement: Exporting a PDF
Export PDF SHALL save the document's current source, rendered by Quarto as described in
`quarto-rendering`, as a PDF Asset named after the document (`<name>.pdf`), listed in Files, and offer
to open it. A failed export SHALL say why and save nothing.

#### Scenario: Export
- **WHEN** the user exports "Huancayo 2025 report.qmd"
- **THEN** Files lists "Huancayo 2025 report.pdf" and the view offers to open it

#### Scenario: A Python cell
- **WHEN** the document holds a ```` ```{python} ```` cell and is exported
- **THEN** the PDF shows the cell's code and no code runs

#### Scenario: A callout
- **WHEN** the document holds a `::: {.callout-note}` block and is exported
- **THEN** the PDF shows the callout as Quarto draws it

#### Scenario: Sidecar not ready
- **WHEN** the user exports while the sidecar is not ready
- **THEN** the export still runs, since the core renders the document itself

#### Scenario: Export fails
- **WHEN** Quarto cannot render the document
- **THEN** the export fails with Quarto's message and no PDF is added to Files

## REMOVED Requirements

### Requirement: Preview requests to the sidecar
**Reason**: Rendering moved to the Rust core, which runs Quarto itself; the sidecar no longer renders.
**Migration**: Replaced by "Rendering a document" in `quarto-rendering`. The `document.preview` and
`document.previewed` frames are removed from the link protocol.

### Requirement: Export requests to the sidecar
**Reason**: Rendering moved to the Rust core, which runs Quarto itself; the sidecar no longer renders.
**Migration**: Replaced by "Rendering a document" in `quarto-rendering`. The `document.export` and
`document.exported` frames are removed from the link protocol.
