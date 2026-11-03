# Proposal

## Why

Installed apps update themselves, so users get new versions without ever seeing what changed, and
the GitHub Release has no notes. Issue #100 asks for a changelog in plain language that is
published with each release and shown in the app.

## What Changes

- A `CHANGELOG.md` at the repository root holds the notes of the current release only, under a
  heading that carries its version, grouped New, Improved and Fixed and written for users. It has no
  history. Its first content is the section for 0.5.2, the current release.
- The release workflow publishes that text as the draft release's notes, and the build fails when
  the heading names a version other than the tag's.
- The changelog is bundled into the app, so it shows without a network connection.
- A "What's new" page shows the notes once, on the first launch after the app updated to a new
  version, and can be dismissed. It is not shown on a fresh install or in Mini-Me Dev. The core
  remembers the last version it showed, in the app settings.
- A button next to the version in Settings → About opens the same page at any time.
- Out of scope: the release script and moving the tag trigger (issue #115); notes beside the ready
  update in the sidebar; older versions' notes; a changelog for Mini-Me Dev; tours and
  per-feature announcements. No new service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `releases`: a release's notes come from `CHANGELOG.md`, and a changelog for another version
  fails the build.
- `app-updates`: the app bundles the changelog, shows What's new once after an update, and opens it
  from About.

## Impact

- Repository: `CHANGELOG.md`, `scripts/check-version.mjs`, `.github/workflows/release.yml`,
  `docs/development.md`.
- Rust core: `settings.rs` (the last version shown, and whether the file was just created) and
  `ipc.rs` (a command that says whether to show What's new).
- UI: a What's new page, a new view, the launch check in `App.tsx`, the About button in
  `SettingsView.tsx`, and a test that the bundled changelog is for the app's version.
- Specs: `releases` and `app-updates`.
- Closes issue #100. No new dependency: the changelog is imported as text by Vite.
