# Proposal

## Why

Releases are built for Windows only, so Mini-Me on macOS has to be built by hand and never
updates itself, and Linux has no build at all. GitHub-hosted runners are free for this
public repository on every platform, so building all three costs no Actions minutes.

## What Changes

- Each release also builds macOS (Apple silicon: `.app` and `.dmg`) and Linux (AppImage and
  `.deb`, built on Ubuntu 22.04 so the AppImage runs on older distributions), next to the
  Windows installer, into the same draft release.
- The release's `latest.json` gains macOS and Linux entries, so installed macOS apps and
  Linux AppImages update themselves like Windows does. The `.deb` does not update itself.
- Installers stay unsigned. The README explains how to open the unsigned macOS app and how
  to run the AppImage, next to the existing Windows SmartScreen steps.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `releases`: the platforms each release contains, the draft a tag produces, and the
  first-launch steps the README gives for unsigned installers.

## Out of scope

- Code signing and notarization on any platform (they need paid certificates).
- Intel Macs, Linux on ARM, and `.rpm` packages.
- Any change to the app itself.

No new external service, credential or cost: the builds run on GitHub-hosted runners, which
are free for public repositories.

## Impact

- `.github/workflows/release.yml`: two more build-matrix entries and the Linux system
  libraries Tauri needs.
- `README.md` (Installing) and `docs/development.md` (Cutting a release).
- No app code, schema, protocol or sidecar change.
