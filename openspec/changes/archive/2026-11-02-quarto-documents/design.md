# Design

## Context

Documents are `.qmd` Assets. Today the sidecar's converter (`sidecar/src/mini_me_sidecar/document_pdf.py`)
turns them into Typst and compiles them with the `typst` Python package, and the core asks the sidecar
for each preview and export through `document.preview` and `document.export` frames
(`src-tauri/src/runs.rs`, `src-tauri/src/link.rs`). See proposal.md for why this changes.

Quarto 1.x is an external program the user installs. Two of its options matter here, both checked
with Quarto 1.10.18:
- `quarto render document.qmd --to typst --no-execute -M keep-typ:true` renders the document to a PDF
  and keeps its Typst source as `document.typ`, without editing the user's file.
- `quarto typst compile --format svg document.typ "page-{p}.svg"` uses Quarto's bundled Typst
  (0.15.1) to write one SVG per page.

## Goals / Non-Goals

**Goals:**
- Quarto's own rendering for the preview and the PDF, with no converter.
- Quarto is found, checked and used only when the user has it; without it, document work is blocked.
- Rendering never runs code and never touches the Project folder beyond reading the files a document names.

**Non-Goals:**
- Quarto 2 (q2), Quarto versions before 1.10, and Quarto's code execution.
- Installing or updating Quarto.

## Decisions

**The Rust core owns rendering.** The core owns the filesystem, the process spawning and the
Project's assets, so it runs Quarto itself. The sidecar keeps only drafting. A new module
`src-tauri/src/quarto.rs` finds Quarto, reads its version and renders documents. The Tauri commands
`preview_document` and `export_document_pdf` keep their names and call the new module.

**Finding Quarto.** The order is: the path set in Settings, then `quarto` on the PATH, then the
usual install folders for the operating system. The install folders are macOS
`/Applications/quarto/bin/quarto` and `~/Applications/quarto/bin/quarto`; Windows
`%LOCALAPPDATA%\Programs\Quarto\bin\quarto.exe` and `C:\Program Files\Quarto\bin\quarto.exe`; Linux
`/usr/local/bin/quarto`, `/opt/quarto/bin/quarto` and `~/.local/bin/quarto`. The Windows and Linux
folders are not yet confirmed against Quarto's installers; task 1.2 checks them. The result is kept in
the core: Quarto is looked up when the app starts (in the background, so nothing waits for it), when
the user clicks Check again, when the location in Settings changes, and when a render finds that
Quarto cannot be started. Every other document action, including each autosave, reads the kept result
instead of starting Quarto to ask its version.

**Version check.** `quarto --version` gives the version, which must be 1.10 or later. The minimum is
1.10 because that is the version both `keep-typ` and `quarto typst compile` were checked on. Quarto's
[Typst format documentation](https://quarto.org/docs/output-formats/typst.html) describes both, but
its release notes do not say which release added them, so no earlier version is claimed to work.

**Render steps.** For each render, the core:
1. creates a folder `Mini-Me Data/<project>/render/<id>/`;
2. writes the source as `document.qmd` and copies each Project asset whose name appears in the source
   under that name;
3. runs `quarto render document.qmd --to typst --no-execute -M keep-typ:true` in that folder, with a
   120-second limit, which leaves `document.pdf` and `document.typ`;
4. for the preview, runs `quarto typst compile --format svg document.typ "page-{p}.svg"` with a
   60-second limit and reads the pages in order;
5. removes the folder, whatever the outcome.

Quarto runs with the folder as its working directory, so a document can only reach the files copied
into it. Its errors are shown with the last lines of its output. Each render uses a new folder, so a
preview and an export can run at the same time.

**The sidecar stops rendering.** `document.preview`, `document.previewed`, `document.preview_error`,
`document.export`, `document.exported` and `document.export_error` are removed from `link.rs` and
from `app.py`'s dispatch; `documents.py` loses its export and preview handlers. The link protocol
version rises by one, in `sidecar/src/mini_me_sidecar/link.py` and in the Rust protocol module, so an
old sidecar is refused.

**Blocking.** The core reports one of four states: found, missing, too old, or broken (found but its
version could not be read). Every document action in the UI and every document tool (`write_document`,
`edit_document`, `suggest_edit`) checks the state first and fails with a `quarto_missing` error when it
is not "found". Files keeps listing `.qmd` documents; opening one shows the notice.

**Project files.** Each Project asset is stored by ID, so the core looks up each asset's name and
copies it when that name occurs in the source. Names are matched as plain text, so a name that occurs
only as part of another word also copies the file; this errs towards including a file.

**Dependencies.** The sidecar drops `typst` and `markdown-it-py` as direct dependencies. Neither is used
by anything else in the sidecar; `markdown-it-py` stays in the lock file through `rich`, as before.

**Project rule.** `openspec/config.yaml` says "No WSL, Docker or other system-level prerequisites."
Quarto is an optional add-on needed only to edit documents, so that line is amended to say so. The app
does not download or install Quarto.

## Risks / Trade-offs

- **Users with an older Quarto are refused.** → The notice names the version found and says 1.10 or
  later is needed, with a link to Quarto's install page.
- **Install folders on Windows and Linux are unconfirmed.** → The PATH and the Settings path still work
  there; task 1.2 checks the folders against Quarto's installers.
- **Renders take seconds.** → The preview renders only on Render, as the spec already says; the view
  shows that it is rendering.
- **Quarto's output changes between versions.** → The minimum version and the protocol check keep the
  app to one known range; the render tests run on the version the user has.
- **Users without Quarto cannot use documents at all.** → Accepted by the decision above; the notice
  links to Quarto's install page.
- **Copying by name can copy extra files.** → Accepted; files are small and the copy only reads them.

## Migration Plan

No data migration: documents stay `.qmd`. The change ships in a release from `dev`. Rolling back means
reverting the release; the old converter returns with it, and documents are unaffected.

## Open Questions

None that change the specs or the task breakdown.
