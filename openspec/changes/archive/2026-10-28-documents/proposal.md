# Proposal

## Why

Mini-Me's Conversations produce findings, tables and charts, but nothing that gathers them into
a document a scientist can edit, keep and hand on. The *Document* Trait has been a placeholder
since the built-in Traits were added. Documents let a Mini-Me draft a report from a
Conversation, the user edit it in the app, and export it as a PDF.

## What Changes

- **Documents:** a document is a Quarto Markdown (`.qmd`) file stored as an Asset of the
  Project, with a YAML header holding its title and author. Quarto, RStudio and other editors
  open the same file.
- **`write_document` tool:** saves a new document in the Project, attaches it to the reply and
  shows a document card below it. *Assist* and *Summarize* list it, so Assistant and Scribe can
  write documents, and user-made Traits can tick it in the Trait editor. The placeholder
  *Document* Trait is removed from the library.
- **Report panel:** a Conversation's tool switch gains Report next to Outline and Jobs. Its
  panel, "Report · Choose how to start", offers **Draft from this conversation**, **Start
  blank**, and **Open from Files**, the Project's documents, newest first. Draft from this
  conversation shows the Mini-Mes whose replies it draws from; its Draft report button creates
  the document, opens it, and fills it as Scribe drafts a report from the Conversation, with a
  Stop button and nothing added to the Conversation.
- **Document view:** a document opens across the whole main sheet under an editor header
  (back link, title, status line, Outline menu, Export PDF), with its Quarto source and a
  preview of its PDF pages always side by side. The source is
  edited as text with highlighting and formatting buttons, and saved automatically exactly as
  typed; the preview renders on opening, after a draft, and on Render. Documents open from the
  Report panel, from a reply's document card, and from Files.
- **PDF export:** Export PDF turns the document into a PDF Asset next to it: the sidecar
  converts its Markdown to Typst and compiles it with Typst, both inside its own Python. Code
  cells are never run.

## Capabilities

### New Capabilities
- `documents`: the document format, creating, opening and editing documents, the document
  view, and PDF export.

### Modified Capabilities
- `tools`: adds the write-a-document tool.
- `tool-use`: prompt-based Traits may list the write-a-document tool.
- `mini-mes`: *Assist* and *Summarize* list `write_document`; *Document* is no longer a
  placeholder Trait.
- `library-editors`: user-made Traits can tick `write_document`.
- `interactive-components`: adds the document component.
- `assets`: documents open in the document view instead of the system's default app.
- `conversation-outline`: Conversations offer the Report panel.

## Out of scope

- Comment threads, Mini-Me text shown in its colour, and Mini-Me edits as suggestions
  (Roadmap #21).
- Mini-Mes editing an existing document; `write_document` only creates new ones.
- Running code cells, Quarto rendering, and export formats other than PDF.
- Sharing documents (the design's Share button) and Dataverse upload.

No new external service, credential or cost. The sidecar gains `typst` (Apache-2.0, the
Typst compiler as a Python extension) and depends directly on `markdown-it-py` (MIT, already
installed through another package); neither adds a program that runs on its own.

## Impact

- Sidecar: the `write_document` tool, a draft handler streaming from the AI model like the
  Overview summary, a PDF export handler with a Markdown-to-Typst converter, and `typst`.
- Link protocol: new `draft.start` / `draft.delta` / `draft.done` / `draft.error` /
  `draft.cancel` and `document.export` / `document.exported` / `document.export_error` frames;
  the protocol version increases on both sides.
- Rust core: commands to create, draft, save and export documents; updating a `.qmd` Asset in
  place inside the Project folder; `write_document` in the library's tool names.
- Library: *Assist* and *Summarize* list `write_document`; *Document* removed.
- UI: the Report panel, the document view with a CodeMirror source editor and the preview,
  the document component, opening documents from Files and replies; CodeMirror 6 and `yaml`.
- Link protocol, as well: `document.preview` / `document.previewed` / `document.preview_error`
  for the preview.
- Docs: README (Traits table and tools), DESIGN.md (document view as built).
