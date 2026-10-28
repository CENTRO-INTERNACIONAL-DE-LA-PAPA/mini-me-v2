# Tasks

## 1. Documents in the core

- [x] 1.1 Add `create_document`, `read_document` and `save_document` (only `.qmd` Assets, written through a temporary file inside the Project folder, `size_bytes` updated), and `modified_at` from the file's modification time on Files' entries; verify with inline Rust tests for creating, saving, refusing a `.csv`, and a failed write leaving the file whole
- [x] 1.2 Register the commands in `lib.rs` and add their types and calls to `src/protocol/types.ts` and `src/api.ts`; verify `cd src-tauri && cargo test` and `npx tsc --noEmit` pass

## 2. The write-a-document tool

- [x] 2.1 Add `write_document` to the sidecar (header built with JSON-quoted values, a file name safe on every platform, `asset.write`, a `document` component), its model form, `TOOL_NAMES` and `MODEL_TOOL_NAMES`; verify with pytest for the header, an unsafe title, and the 2 MiB limit
- [x] 2.2 Add `write_document` to `library.rs`'s tool names, list it on *Assist* and *Summarize* with the extra *Summarize* instruction, and delete the *Document* placeholder from `builtin.json`; verify the library tests, updated for the Trait and placeholder lists, pass
- [x] 2.3 Offer `write_document` in the Trait editor's tool choices; verify `npx tsc --noEmit` passes

## 3. Drafting and PDF export

- [x] 3.1 Add `typst` and `markdown-it-py` to the sidecar with `uv add`, and an export handler that converts a document's Markdown to escaped Typst (headings, paragraphs, emphasis, inline code, links, quotes, lists, code blocks, tables; Quarto blocks as plain text) and compiles it to PDF in memory; verify with pytest for each block's Typst, escaping, a callout, and that a document with a table and a `{python}` cell exports to bytes starting with `%PDF` and runs no code
- [x] 3.2 Add the `document.export` / `document.exported` / `document.export_error` frames on both sides, raise the protocol version, and add `export_document_pdf` to the core, storing the PDF as a `generated` Asset; verify with an inline Rust test for the frames and the stored Asset's name, and `cd sidecar && uv run pytest`
- [x] 3.3 Add the `draft.start` / `draft.delta` / `draft.done` / `draft.error` / `draft.cancel` frames, a sidecar draft handler streaming from the model with its drafting rule, and `draft_document` / `stop_draft` in the core that forward deltas to a channel and save the text to the `.qmd` on every ending; verify with pytest for the handler's prompt and cancel, and an inline Rust test that a stopped draft is saved
- [x] 3.4 Check the release bundle carries Typst: run `npm run bundle-sidecar` and verify `typst` and `markdown_it` are inside `src-tauri/resources/sidecar/` and a PDF compiles with the bundled Python

## 4. The document view

- [x] 4.1 Add CodeMirror 6 and `yaml`; add `qmd.ts` (the title from the YAML header, the headings outside the header and code blocks) and `sourceEdits.ts` (marks around the selection, line markers); verify with `*.test.ts` for each
- [x] 4.2 Add `document.preview` / `document.previewed` / `document.preview_error`, the sidecar's SVG pages, and `preview_document` in the core; verify with pytest and an inline Rust test
- [ ] 4.3 Add the `document` View and `DocumentView` (EditorHeader with back link, title, status line, Outline menu and Export PDF; source and preview always side by side; the CodeMirror source with formatting buttons, saved one second after typing and on close; the preview with Render and its out-of-date note) and open it from Files' `.qmd` rows; verify in the app that a document opens from Files, edits survive closing and reopening, the Outline jumps to headings, Render shows the pages, and Export PDF saves a PDF that opens

## 5. The Report panel and the document component

- [x] 5.1 Add the `document` component renderer (title, icon, Open, removed state) to the catalogue; verify with a renderer test for both states
- [ ] 5.2 Add the Report panel (Draft from this conversation with the Mini-Mes drawn from and Draft report, Start blank, Open from Files) to the Conversation's tool switch, and the drafting state of the document view ("Scribe is drafting…", Stop, read-only source filled as text arrives, then the preview rendered); verify in the app that Draft report opens a new document that fills as Scribe writes, Stop keeps what was written, nothing is added to the Conversation, Start blank opens a new document, and close returns to the Conversation

## 6. Docs and checks

- [x] 6.1 Update README (the Traits table without *Document*, documents and PDF export), `docs/using.md` and DESIGN.md's Report notes as built; verify they match the app
- [x] 6.2 Run `cd src-tauri && cargo test`, `npm test` and `cd sidecar && uv run pytest`; verify all pass

## Workflow follow-up

- The user verifies the change in the app.
- Archive the change with `/opsx:archive`, syncing its specs into `openspec/specs/`.
- Mark this change "Done" in `docs/roadmap.md` and #21 "Next".
- Ask the user, then open the pull request into `dev`.
