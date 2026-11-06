# Design

## Context

Release builds run `npm run build && npm run bundle-sidecar` before bundling
(`tauri.release.conf.json`), and bundle `src-tauri/resources/sidecar/` as a resource. The
sidecar bundle (`sidecar/scripts/bundle.py`) installs the locked Python packages, with their
`*.dist-info` metadata, into `packages/` and a standalone CPython, with its `LICENSE.txt`, into
`python/`. The release workflow builds on Windows, macOS and Linux with `tauri-action`.
`LICENSE` (GPL-3.0) and `NOTICE` are at the repository root. Settings → About is `AboutPage` in
`SettingsView.tsx`, which already opens What's new as a page of its own.

## Goals / Non-Goals

**Goals:**
- Every license a release ships, collected by the build, so it never goes stale.
- One page in the app to read them, like other apps' third-party notices.
- A release fails rather than ship a component that declares no license.

**Non-Goals:**
- Changing Mini-Me's license, or settling the `regex` CNRI-Python question.
- A license page in the Windows installer.

## Decisions

These were settled with the user while planning:
- One script of our own collects the licenses, with no new tools: established tools brought
  148 npm packages (`generate-license-file`) or missed half the Python licenses
  (`pip-licenses`).
- One file, written only into the build, and one page in the app with a table of contents that
  goes to each component's section; no folder of files.
- The row and page are named "Third-party Software".
- No license page in the Windows installer.

### Collecting (`scripts/third-party.mjs`)
Run by `npm run third-party` after `bundle-sidecar` in the release config. For each part:
- Core (Rust): `cargo metadata --format-version 1 --filter-platform <target>`, keeping the
  crates reachable from `mini-me` through normal dependencies; each crate's folder is its
  `manifest_path`'s folder; name, version, `license` and `repository` (else `homepage`) come
  from the metadata.
- Interface (npm): `npm ls --omit=dev --all --parseable` for the packages' folders; name,
  version, `license` and `repository` (else `homepage`) from each `package.json`.
- AI runtime (Python): each `*.dist-info` in the bundled `packages/`, read from its `METADATA`
  (`License-Expression`, else `License`, else the license classifiers; a source or repository
  `Project-URL`, else `Home-page`), and the runtime from `python/`.
A component's texts are its files whose names start with `LICENSE`, `LICENCE`, `COPYING`,
`NOTICE` or `AUTHORS`; with none, the declared license's name stands in. A component that
declares no license stops the script with its name.

### The file
`src-tauri/resources/third-party.json`, ignored by git like the rest of `resources/`:
`{ notice, license, texts: [string], components: [{ part, name, version, license, repository,
texts: [index] }] }`, components sorted by part and name. `texts` holds each distinct text
once, so the many identical MIT and Apache texts take the space of one each.

### Showing (core and UI)
`get_third_party` reads the file from the app's resource directory and returns it, or nothing
when it is not there. The About row opens a page like What's new: Mini-Me's notice and license,
then the table of contents by part, then the sections, each with an anchor the table of contents
links to.

## Risks / Trade-offs

- [The script misses where a package keeps its license] → It lists the declared license's
  name, and a component that declares none fails the build.
- [The Rust crates differ by platform] → Each platform's build runs the script for its own
  target, so each app lists what it ships.
- [A long page] → The table of contents goes to each section; the texts are read only when the
  page opens.

## Migration Plan

None. The page fills from the next release.

## Open Questions

None.
