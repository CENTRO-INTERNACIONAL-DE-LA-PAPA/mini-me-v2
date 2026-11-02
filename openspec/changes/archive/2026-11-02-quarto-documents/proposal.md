# Proposal

## Why

Documents are edited as Quarto Markdown, but the app converts them to Typst itself with a converter
that covers only part of Quarto. Features such as `date` and a table of contents are missing, and
each new one is more converter code to maintain. Quarto 1.x renders these features natively. Using
the user's own Quarto install for editing and rendering gives every Quarto feature without the
converter.

## What Changes

- **Quarto add-on.** Editing documents needs a Quarto install on the user's machine. The app finds
  it, checks that it is version 1.10 or later, and shows its version in Settings. Quarto is an
  optional add-on, not a prerequisite of the app: without it, the rest of Mini-Me works as before.
- **Blocked without Quarto.** Without a usable Quarto, the app does not create, draft, open, edit,
  preview, export or comment on documents. A document view says what is missing and links to
  Quarto's install page. Files still lists existing `.qmd` documents as ordinary files.
- **Rendering in the Rust core.** The core renders a document by running Quarto on a copy of it in a
  temporary folder, with `--no-execute`, so no code cell runs. The preview and PDF export are both
  rendered this way. The Quarto render takes a few seconds, and the preview is still rendered only
  when the user clicks Render.
- **Project files for rendering.** Project files that a document refers to by name (for example
  figures) are copied into the temporary folder under those names.
- **Converter removed.** The sidecar's Markdown-to-Typst converter is removed, and so are its
  dependencies that nothing else uses (`markdown-it-py` as a direct dependency, and `typst`).
- **Sidecar requests removed.** The `document.preview` and `document.export` requests and their
  replies are removed from the link protocol, which changes the protocol version. Drafting stays in
  the sidecar.
- **Project rule amended.** `openspec/config.yaml` says there are no system-level prerequisites.
  That rule is amended to allow Quarto as an optional add-on for editing documents.

Out of scope:
- Running code cells, and any change to how Quarto executes them.
- Quarto 2 (q2), which is experimental.
- Migrating existing documents: none is needed, since documents stay `.qmd`.
- Rendering with Quarto versions before 1.10.

## Capabilities

### New Capabilities

- `quarto-rendering`: finding a Quarto install and checking its version, blocking document work
  without one, and rendering documents with it for the preview and PDF export.

### Modified Capabilities

- `documents`: documents are blocked without Quarto; the preview and export are rendered by Quarto
  rather than by the sidecar; a callout and a code cell are rendered as Quarto renders them; the
  sidecar's preview and export requests are removed.

Capabilities not changed: `assets`, `document-comments`, `interactive-components` and `tools`. They
refer to `.qmd` documents, which stay `.qmd`, and their behaviour is blocked only through the
`documents` capability.

## Impact

- **Rust core:** a Quarto locator and version check, a render module that runs Quarto in a temporary
  folder with a time limit, and the preview and export commands moved from the sidecar. The link
  protocol loses six `document.*` frames.
- **Sidecar:** `document_pdf.py` is removed; `documents.py` keeps drafting; `typst` and
  `markdown-it-py` are removed as direct dependencies.
- **UI:** the document view shows the Quarto notice, the Settings screen shows the Quarto status, and
  document actions are disabled without Quarto.
- **Project rules:** `openspec/config.yaml` changes its "no system-level prerequisites" line.
- **Docs:** `docs/using.md` and `docs/architecture.md` describe the Quarto add-on.
- **External services, credentials and costs:** none. Quarto is an external program that the user
  installs themselves; the app does not download it.
