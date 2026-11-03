# Proposal

## Why

Cutting a release is manual and easy to get wrong: the version is edited by hand in five files,
and the tag is typed by the maintainer after the merge, where a wrong commit is easy to tag. Issue
#115 asks for one command that prepares a release. Exploring the options showed the tag step can go
too: if `main` itself says which version it carries, CI can tag the merge commit.

## What Changes

- `package.json`'s version becomes the single place the app version is set. `package-lock.json`
  follows it through `npm version`, `src-tauri/tauri.conf.json` reads it from `../package.json`,
  and `Cargo.toml` stops carrying the app version (one edit now, none per release).
- The maintainer writes `CHANGELOG.md` for the new version by hand, then runs one command with
  nothing to type, `npm run release`, from `dev`. The version is the one in the changelog's first
  line, so that file is the only thing the maintainer sets. The command checks that version is new,
  sets it in `package.json`, commits `chore(release): <version>` to `dev`, pushes `dev` and opens the
  `dev` to `main` pull request with the changelog as its body. It never merges, tags or publishes.
- `check-version` checks everything a release depends on, and runs on every pull request, so a
  mismatch is caught before the merge.
- The Release workflow starts when `main` changes, not when a tag is pushed. If `main` carries a
  version that has no tag, it creates the tag at that commit, creates the draft release with the
  changelog as its notes and builds the three platforms. Otherwise it does nothing.
- `docs/development.md` describes the new way to cut a release.
- Out of scope: merging into `main` (stays manual), publishing the draft release, drafting the
  changelog from commits, the in-app What's new (done in #100). Nothing reaches users until the
  maintainer publishes the draft. No new service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `releases`: releases are built when `main` carries a version no tag marks, the version is set in
  one place, the changelog must be for that version, and a script prepares the release.

## Impact

- Repository: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
  `Cargo.lock` (once), `scripts/check-version.mjs`, new `scripts/release.mjs` and
  `scripts/release-lib.mjs` with tests, `.github/workflows/release.yml` and `ci.yml`,
  `docs/development.md`.
- A Rust test that the app version comes from `package.json`.
- Specs: `releases`.
- Closes issue #115. No new dependencies: the script uses Node, `git`, `npm` and `gh`, which
  the maintainer already has. The first run of the new workflow, when this change reaches `main`,
  does nothing because v0.5.2 is already tagged.
