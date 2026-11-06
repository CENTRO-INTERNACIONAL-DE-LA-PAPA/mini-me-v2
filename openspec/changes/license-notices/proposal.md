# Proposal

## Why

Mini-Me is licensed under GPL-3.0-or-later (#152), and every release bundles hundreds of Rust
crates, npm packages, Python packages and a Python runtime whose licenses ask for their
copyright notices and license texts to travel with each copy. Releases carry none of them
today, and the app does not credit the projects it is built on (#151).

## What Changes

- **Each release build collects the third-party software it ships** into one file inside the
  app: Mini-Me's `NOTICE` and license, then every third-party component (Rust crate, npm
  package, Python package, the Python runtime) with its part of the app, name, version,
  repository and license text. Identical license texts are stored once. One script does it,
  reading where each ecosystem keeps its packages; it adds no tools, and the file exists only
  in the built app.
- **Settings → About gets a "Third-party Software" row** that opens a page inside Mini-Me: a
  table of contents grouped by part of the app, and below it each component's section, with its
  repository link and license text. Clicking an entry of the table of contents goes to its
  section.
- The Windows installer shows no license page: the GPL does not ask users to accept it.
- Development builds have no file; the page says the list comes with released builds.
- Out of scope: changing Mini-Me's license; the `regex` (CNRI-Python) question, which is for
  CIP's legal office.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `releases`: every release build ships the third-party software file.
- `app-updates`: Settings → About opens the "Third-party Software" page.

## Impact

- Build: `scripts/third-party.mjs`, run in the release config before bundling, writing
  `src-tauri/resources/third-party.json`, bundled as a resource.
- Core: an IPC command that reads the file.
- UI: the "Third-party Software" row and page.
- Docs: `docs/development.md` on how the file is made.
