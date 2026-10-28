# Design

## Context

- Assets are files in the Project's `assets/` folder with a registry row (`assets.rs`). Traits
  save files through the sidecar's `save_file` tool, which asks the core to `asset.write`;
  nothing updates an Asset after it is stored, and opening one hands it to the OS.
- Tools are named in three places that must agree: `library.rs`, the sidecar's
  `tools/__init__.py` (`TOOL_NAMES`, `MODEL_TOOL_NAMES`) and the model forms in
  `tools/model.py`. Interactive Component kinds are hand-coded renderers in
  `src/components/interactive/`, looked up by `catalogue.ts`; the core checks only size and
  core-only kinds.
- The core already asks the sidecar for one-off work outside a reply: `summary.start` and its
  `summary.done` / `summary.error` answers, with a timeout.
- The composer is a TipTap 3 editor; the Conversation's tool switch offers Outline and Jobs.
- The design's F08 (Report picker) and F09 (document view) frames define the look; DESIGN.md
  has notes for both. Files, not "Drive", is the app's name for the Files screen.

## Goals / Non-Goals

**Goals:**
- One file per document that any Quarto tool reads, with no hidden state beside it.
- Editing that never loses Quarto content the editor does not understand.
- Durable state in the core; the sidecar converts text it is given and keeps nothing.

**Non-Goals:**
- Collaborative or concurrent editing; Mini-Mes changing existing documents (#21).
- Running code, Quarto rendering, or exports other than PDF.

## Decisions

### A document is a `.qmd` Asset (Rust core)
Documents are ordinary Assets whose name ends in `.qmd`, with media type `text/markdown`, so
Files, attachments, `#` references and the read-a-file tool already work for them. The core
gains three commands:
- `create_document(project_id, title)` writes "Untitled document.qmd" (source `upload`) with a
  YAML header holding the title and, when set, the user's name as author;
- `read_document(project_id, asset_id)` returns the file's text;
- `save_document(project_id, asset_id, text)` refuses any Asset not named `.qmd`, writes the
  file inside the Project folder through a temporary file and a rename, and updates the
  registry's `size_bytes`.
The last-edited time is the file's modification time, added to Files' entries as
`modified_at`, so no schema change is needed.

*Alternative:* documents as rows in `project.sqlite`. Rejected by the user in favour of Quarto
files, which also keeps them readable by RStudio and Quarto outside the app.

### The write-a-document tool (sidecar)
`write_document(title, body)` builds the YAML header itself, quoting values as JSON strings
(valid YAML, so no YAML library is needed), names the file after the title with characters
invalid on Windows, macOS or Linux replaced, and saves it through the same `asset.write`
request as `save_file`, then adds a `document` component `{ asset_id, title }`. It joins
`TOOL_NAMES` and `MODEL_TOOL_NAMES`, gets a model form, and is listed by *Assist* and
*Summarize*; `library.rs` learns the name. *Summarize*'s instructions gain one paragraph:
when asked for a report or document, write it with `write_document` from the Conversation's
earlier messages. The placeholder *Document* Trait is deleted from `builtin.json`; no
Workflow can reference a placeholder, so nothing depends on its ID.

*Alternative:* building *Document* as a Trait (the placeholder's plan). Rejected: a tool lets
any Trait that needs it write documents without a dedicated Mini-Me.

### Drafting from a Conversation (Rust core, sidecar, UI)
Draft report creates the document with `create_document` (title: the Conversation's title,
author: the user's name), opens it, and calls `draft_document(project_id, asset_id,
conversation_id, on_text)`. The core builds the material from that Conversation's messages
within the history budget, the same way `overview::summary_material` does for every
Conversation, and sends `draft.start` with the model from Settings. This follows the Overview
summary: a one-off AI call outside any reply, whose key is released per call with the draft's
ID. Unlike the summary it streams: the core forwards each `draft.delta` to the UI's channel and
keeps the text, and on `draft.done`, `draft.error`, `stop_draft` (which sends `draft.cancel`)
or the view closing, writes the header and the text so far to the `.qmd` file. The sidecar's
handler writes as Scribe with its own drafting rule, as the summary has its own rule (a
Markdown report with a summary first, then a section per topic, crediting which Mini-Me found
what), through the same provider client as the summary; the sidecar receives no Trait
definitions outside a run, so it does not reuse *Summarize*'s instructions.
While drafting the UI re-parses the received Markdown into the read-only editor at most a few
times a second; afterwards the page becomes editable and autosaves as usual. Nothing is added
to the Conversation, so drafting needs no reply, Workflow or routing.

*Alternative:* sending `@Scribe` a message asking for a report, with the document arriving as
Scribe's reply. Simpler, and dropped at the user's request: the request and reply would clutter
the Conversation, and the document would appear only once the reply ended.

### Report panel and document view (UI)
- The Conversation's `Panel` type gains `report`; `ReportPanel` (tool sheet, 380px) renders
  the three options of F08 as outlined `Card`s, the app's one card style, rather than the
  design file's ink ring. Its document list comes from `list_project_files` filtered to
  `.qmd`, most recently edited first, tinted by the Mini-Me whose reply attaches the file.
- `View` gains `{ kind: "document", assetId, from, draftFrom? }`. `App.tsx` renders
  `DocumentView` in the main sheet with no tool sheet; the back link names `from` (the
  Conversation's title or Files) and returns to it.
- `DocumentView` uses the editors' `EditorHeader` without its identity tile (a document's
  icon would never change) (back link, serif title from the YAML header, status line, actions on the right, problems below) instead of F09's flat
  bar, so it matches the Mini-Me and Trait editors. The actions are an Outline menu of the
  source's headings and Export PDF; the source and the preview are always side by side, as the
  user asked, with no switch. Share is left out.

### Editing the source (UI)
The document is edited as its whole Quarto file in CodeMirror 6 (`@codemirror/view`,
`state`, `commands`, `language`, `lang-markdown`, and `@lezer/highlight` for the style; all
MIT, plain JavaScript, nothing to install on any platform): Markdown highlighting in the
theme's colours, line wrapping, undo. What is typed is saved as typed, so no Quarto construct
can be lost, and images, figure options or complex tables need nothing from the app. The
formatting buttons are pure edits of the editor state (`sourceEdits.ts`, tested without a
DOM): marks around the selection, and heading, quote or list markers at the start of the
selected lines. The title and outline are read from the text (`qmd.ts`): the title through
`yaml` (ISC), and headings outside the header and code blocks. Saving is debounced (one second
after typing stops) and flushed on close. While Scribe drafts, the source is read-only and is
replaced by the header plus the received text a few times a second.

*Alternative:* formatted editing with TipTap and Markdown round-tripping, built first and
replaced at the user's request: it hid Quarto's source, so images, figure options and complex
tables were out of reach, and the round trip could rewrite equivalent Markdown.

### The preview (sidecar, link, UI)
`preview_document(source)` sends `document.preview { preview_id, source }`; the sidecar runs
the same conversion as the export and asks Typst for SVG, one image per page, answering
`document.previewed { preview_id, pages }` or `document.preview_error`. Pages are about
370 KB each, as text is drawn as outlines, so the preview is not redrawn on every pause: it
renders when the document opens, when a draft ends, and on the Render button in the header,
next to Outline and Export PDF, and the bar under the header says when the source has changed
since. The UI shows each page as an image from a blob URL on the muted
preview pane.

*Alternative:* an HTML preview drawn as the user types. Rejected by the user: it would only
approximate the PDF.

### PDF export (sidecar, link)
`export_document_pdf(project_id, asset_id)` in the core reads the file, sends
`document.export { export_id, name, source }`, and waits up to 120 seconds for
`document.exported { export_id, data }` (base64) or `document.export_error`. The sidecar splits
off the YAML header (title, author), parses the body with `markdown-it-py` (CommonMark plus its
table rule), and writes Typst for each block: headings, paragraphs, bold, italic, inline code,
links, quotes, bulleted and numbered lists, code blocks (including code cells, printed with
their language and never run) and tables. Text is escaped for Typst, so nothing in a document
is read as Typst markup. Quarto fenced divs and shortcodes become plain paragraphs of their
text. `typst.compile` then turns the source into PDF in memory, with Typst's bundled fonts; the
sidecar touches no file. The core stores the result as a `generated` Asset named
`<document name without .qmd>.pdf`. The link protocol version goes up by one on both sides,
since both rely on the new frames.

*Alternatives:* Pandoc through `pypandoc_binary` (tried: its macOS arm64 wheels contain the
x86-64 program in every recent version, so Apple-silicon Macs without Rosetta cannot run it;
it would also add a GPL program for IT to allowlist); bundling Quarto (rejected by the user for
its size and the programs it runs); WeasyPrint (needs system libraries on Linux and Windows).

### Dependencies and licences
`typst` 0.15 (Apache-2.0) has wheels for macOS arm64, Linux x86-64 and Windows x64 and runs
inside `python.exe`, so no new program is started and nothing new needs allowlisting.
`markdown-it-py` (MIT) is pure Python and already in the lock file through another package; it
is now declared directly because the export depends on it. `bundle.py` ships both with the rest
of `site-packages`.

## Risks / Trade-offs

- [The converter lays out less than Quarto would] → the preview shows exactly what the PDF
  will be, so nothing is a surprise; Quarto constructs it does not know keep their text as
  plain paragraphs, and the source keeps them for Quarto itself.
- [Installers grow by the Typst compiler] → accepted for PDF export without Quarto.
- [A long Conversation exceeds the history budget] → the oldest messages are left out of the
  material, as for replies; the draft says nothing about them.
- [The draft is not valid Quarto] → it is ordinary Markdown in the source, which the user can
  fix; Markdown never fails to parse, and the preview and export report Typst's error if
  compiling fails.

## Migration Plan

None for data: documents are new Assets, and no schema changes. Releases need the sidecar's
new dependencies, which the bundle picks up from the lock file. Rolling back leaves `.qmd`
files as ordinary Assets that open in the system's default app.
