# Proposal

## Why

Canary builds are named after their commit (`canary-9da941e`, "Mini-Me Canary 9da941e"), which
does not say which release they lead to, and their real order is hidden in a `0.0.<run number>`
version. Named after the version on `dev` with a counter, a build reads as "the second build of
the changes leading to v0.8.1" and carries its own order. Issue #187.

## What Changes

- **Canary builds are named after the version on `dev`.** With `<version>` from `package.json`
  and `<n>` one above the highest published canary build of that version (1 if none), a build
  is tagged `v<version>-canary.<n>`, its pre-release is named "Mini-Me <version>-canary.<n>",
  and the app's version is `<version>-canary.<n>`. The release notes name the commit it was built
  from.
- **The counter orders builds.** The `0.0.<run number>` version goes away: `0.8.1-canary.2` comes
  after `0.8.1-canary.1` and before `0.8.2-canary.1`, so a fix without a bump and a bump both
  reach installed copies, and copies on `0.0.<run number>` update to the first new build.
- **A released version builds nothing.** When `v<version>` is already released, the run fails
  and says to bump the version on `dev`; bumping stays manual.
- **A commit that already has a canary build builds nothing**, now found by the tag pointing at
  the commit instead of a tag named after it.
- **Stale draft cleanup** removes only drafts tagged `v…-canary.…`, never a draft from
  `release.yml`; and `release.yml`'s cleanup, which today deletes every draft tagged `v…`, skips
  canary drafts, so a release no longer deletes a canary build in progress.
- **Settings → About** shows a canary build as "Mini-Me <version>-canary.<n>", read from the
  app's version; a run from source still shows "Mini-Me Canary (local)". The build-time commit
  value is no longer needed.

Out of scope: production releases (`release.yml`), except its draft cleanup above; bumping the
version on `dev`, which stays a manual step; renaming canary builds already published; the app's
name, which stays "Mini-Me Canary" so it installs next to Mini-Me.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canary-channel`: canary builds are named and ordered by the version on `dev` and a counter;
  the examples of updates and of builds never reaching Mini-Me use the new names.

## Impact

- CI: `.github/workflows/canary.yml` (draft job: version, counter, tag, name, notes, skip check,
  draft cleanup; build job: app version, no `VITE_COMMIT`); `.github/workflows/release.yml`
  (one filter in its draft cleanup).
- UI: `src/lib/format.ts` (`appLabel`), `src/components/settings/SettingsView.tsx`, and their
  test.
- Docs: `docs/development.md` (Canary builds). No `CHANGELOG.md` line: Mini-Me users see no
  change.
