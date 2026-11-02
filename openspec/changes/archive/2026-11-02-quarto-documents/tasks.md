# Tasks

Builds and tests are run by the user, who pastes the output back (see CLAUDE.md). A task is marked done
only after that run confirms it.

## 1. Verify the assumptions

- [x] 1.1 Minimum version: Quarto's release notes do not say when `keep-typ` and `quarto typst compile`
      arrived, so the minimum is 1.10, where both were checked (see design.md).
- [ ] 1.2 Confirm the Quarto install folders for Windows and Linux against Quarto's installers, and
      correct the design if they differ. The download page lists only installers, so these stay
      best-effort; the PATH and the Settings path are the main lookups.

## 2. Project rules, dependencies and protocol

- [ ] 2.1 Amend the "No WSL, Docker or other system-level prerequisites" line in
      `openspec/config.yaml` to allow Quarto as an optional add-on for editing documents.
- [ ] 2.2 Remove `typst` and `markdown-it-py` from `sidecar/pyproject.toml` and the lock file, and
      confirm nothing else imports them.
- [ ] 2.3 Raise the link protocol version by one in `sidecar/src/mini_me_sidecar/link.py` and in the
      Rust protocol module.

## 3. Rust core: Quarto

- [ ] 3.1 `quarto.rs`: find Quarto in the order Settings, PATH, install folders. Unit tests: each
      source is used when the earlier ones are absent, and a Settings path wins over PATH.
- [ ] 3.1a Keep the lookup in the core and reuse it: look up at startup in the background, and again
      only on Check again, on a location change, and when a render cannot start Quarto. Unit tests: two
      reads make one lookup; a refresh and a location change each make another.
- [ ] 3.2 Read `quarto --version` and check it is at least 1.10; report found, missing, too old or
      broken. Unit tests: 1.9.9 is too old, 1.10.0 and 1.10.18 are supported, unreadable output is broken.
- [ ] 3.3 Render: create the render folder under the Project's data folder, write `document.qmd`,
      copy the Project assets the source names, run Quarto with `--no-execute -M keep-typ:true` and a
      120-second limit, read `document.pdf`, and remove the folder. Unit tests: the folder is removed
      after success and after failure; only named assets are copied.
- [ ] 3.4 Preview pages: run `quarto typst compile --format svg` with a 60-second limit and read the
      pages in order. Unit test: the page names are read in order.
- [ ] 3.5 Errors: report Quarto's last output lines as the error message. Unit test on a sample of
      Quarto output.
- [ ] 3.6 Rewire the Tauri commands `preview_document` and `export_document_pdf` to the new module,
      and add a `quarto_status` command for the UI.
- [ ] 3.7 Make the document tools (`write_document`, `edit_document`, `suggest_edit`) and document
      actions fail with `quarto_missing` unless Quarto is found. Unit test: the check refuses when
      Quarto is missing.

## 4. Sidecar: remove rendering

- [ ] 4.1 Delete `sidecar/src/mini_me_sidecar/document_pdf.py` and `sidecar/tests/test_document_pdf.py`.
- [ ] 4.2 Remove the export and preview handlers from `documents.py` and their dispatch in `app.py`.
- [ ] 4.3 Update `sidecar/tests/test_draft.py` to drop the export and preview tests; keep the draft
      tests.
- [ ] 4.4 Remove the six `document.*` frames from `src-tauri/src/link.rs` and the export and preview
      functions from `src-tauri/src/runs.rs`, with their tests.

## 5. Frontend

- [ ] 5.1 Document view: when Quarto is not found, show the Quarto notice with a link to Quarto's
      install page, in place of the source and the preview, and disable Export PDF.
- [ ] 5.2 Disable Start blank and Draft report, and the document actions, when Quarto is not found;
      Files still lists `.qmd` documents. Frontend test for the gating rule on a sample state.
- [ ] 5.3 Preview shows "Rendering…" while Quarto works.
- [ ] 5.4 Settings: a Quarto section with the status, the version, the location, a button to set the
      location, a button to clear it and a Check again button.
- [ ] 5.5 The notice's Check again button looks for Quarto again; opening a document, the Report panel
      or Settings does not.

## 6. Documentation

- [ ] 6.1 `docs/using.md`: install Quarto to edit documents; what happens without it.
- [ ] 6.2 `docs/architecture.md`: the core renders documents with Quarto; the sidecar drafts only.

## 7. Verification (user runs)

- [ ] 7.1 `cd src-tauri && cargo test`, `npm test`, `cd sidecar && uv run pytest`: all pass; paste the
      output.
- [ ] 7.2 In the app without Quarto: Start blank, Draft report and Export PDF are disabled, and an
      existing document shows the notice.
- [ ] 7.3 In the app with Quarto: create a blank document; a date, `toc: true` and a footnote render in
      the preview and the PDF; a `{python}` cell shows its code and does not run; a callout renders.
- [ ] 7.4 Set the Quarto path in Settings to a wrong file and check the message; clear it and check the
      status returns to the PATH lookup.
- [ ] 7.5 Check that a figure named in the source appears in the render.
- [ ] 7.6 Archive the change (`/opsx:archive`) after 7.1 to 7.5 are verified, as CLAUDE.md requires.
