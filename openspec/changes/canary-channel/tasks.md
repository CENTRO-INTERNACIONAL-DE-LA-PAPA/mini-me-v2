# Tasks

## 1. Mini-Me Dev becomes Mini-Me Canary

- [x] 1.1 Rename `src-tauri/tauri.dev.conf.json` to `tauri.canary.conf.json` with the identifier
  `org.cipotato.mini-me.canary`, the name and window title "Mini-Me Canary" and the icons in
  `icons/canary/`; rename `icons/dev/` to `icons/canary/` and `app-icon-dev.svg` to
  `app-icon-canary.svg`; point the `tauri:dev` script in `package.json` at the new config. Verify
  that `npm run tauri:dev` opens a window titled "Mini-Me Canary" with the Canary icon.
- [x] 1.2 In the Rust core, rename `is_mini_me_dev` to `is_canary` testing the `.canary` suffix,
  the folder constant to `Mini-Me Data (Canary)`, and `is_dev_app` to `is_canary` in `ipc.rs`,
  `settings.rs` and `features.rs`; reword the comments and the `src/api.ts` comments that name
  Mini-Me Dev. Verify with `cargo test` (the inline folder-name test covers both identifiers), and
  that a local run creates `Documents/Mini-Me Data (Canary)` and starts with Developer mode and
  every feature flag on.
- [x] 1.3 Update `docs/development.md`, `docs/architecture.md` and `docs/feature-flags.md` for the
  new name, identifier, folder, config file and icon paths. Verify that a search for "Mini-Me Dev",
  "mini-me.dev", "tauri.dev.conf", "icons/dev" and "(Dev)" finds nothing outside
  `openspec/specs/` and `openspec/changes/`.

## 2. Mini-Me Canary updates itself

- [x] 2.1 Add the Canary feed, `releases/download/canary/latest.json`, as
  `plugins.updater.endpoints` in `tauri.canary.conf.json`, and in `AppState::init` start update
  checks in every release build. Verify with `cargo test`, and that a local run logs no update
  check.
- [x] 2.2 In Settings → About, show a Canary app by its commit, from the build's `VITE_COMMIT`.
  Verify with a Vitest test of the label ("Mini-Me" with 0.6.0 gives "Mini-Me 0.6.0";
  "Mini-Me Canary" with the commit `a1b2c3d` gives "Mini-Me Canary a1b2c3d", and with none
  "Mini-Me Canary (local)"), and that a local run shows "Mini-Me Canary (local)".

## 3. Releasing Mini-Me

- [ ] 3.1 Add `scripts/sync-version.mjs` and the `sync-version` script in `package.json`: it copies
  the version in the changelog's first line into `package.json` and `package-lock.json`. Delete
  `scripts/release.mjs`, the `release` script, and `releaseVersion`, `latestVersion` and
  `compareVersions` in `scripts/release-lib.mjs` with their tests. Verify with `npm test`, then by
  raising the changelog's first line and running `npm run sync-version` followed by
  `npm run check-version` and `git status` (two files changed, nothing committed); by running it
  again, which must change nothing; and with a first line that names no version.
- [ ] 3.2 Add a `publish` job to `release.yml` that needs every build job and publishes the draft
  as the latest release; reword the workflow's header comment, which says the draft waits to be
  published. Verify by reading it against the `releases` delta: a failed platform skips the job,
  and re-running failed jobs runs it.

## 4. The Canary workflow

- [ ] 4.1 Add `canary.yml`: the push trigger on `dev` with the ignored paths, `workflow_dispatch`
  and the concurrency group; the `draft` job (stops when `canary-<hash>` exists, leftover drafts deleted,
  draft pre-release "Mini-Me Canary <hash>" with the tag name `canary-<hash>` and the target
  commit); its own `build` job for the three platforms, which stamps `0.0.<run number>`, sets
  `VITE_COMMIT` and builds with the Canary config. Verify by reading it, and by running its draft-listing command locally with `gh`.
- [ ] 4.2 Add the `publish` job to `canary.yml`: publish the draft as a pre-release that is not the
  latest release, and copy `latest.json` to the `canary` pre-release. Verify by reading it; the
  trial in group 5 runs it.
- [ ] 4.3 Document both channels: a "Mini-Me Canary" section in `README.md` (what it is, that
  important work belongs in Mini-Me, where to download it, its install folder on Windows and the
  IT allowlist path); "Canary builds" in `docs/development.md` (when one is made, its name and
  tag, the feed, re-running a failed build) and "Cutting a release" (write the changelog as
  changes land; to release, raise its first line, run `npm run sync-version`, try the newest
  Canary build, merge `dev` into `main`, and the release publishes itself); in `CLAUDE.md`, that a change adds its line to
  `CHANGELOG.md`; a "Canary channel" row in `docs/roadmap.md`. Verify by reading them against the
  workflows.

## 5. Trial

- [ ] 5.1 Add the feature branch to the push trigger of `canary.yml` and push. Verify that the run
  publishes "Mini-Me Canary <hash>" with the Windows, macOS and Linux files and the tag
  `canary-<hash>`,
  that the `canary` pre-release holds `latest.json` pointing at them, and that GitHub still shows
  the last Mini-Me release as Latest.
- [ ] 5.2 Install that build, then push another commit to the branch. Verify that the installed
  Mini-Me Canary shows the next build downloading and restarts into it, that Settings → About
  shows its commit, and that an installed Mini-Me reports no update.
- [ ] 5.3 Remove the feature branch from the push trigger. Verify that a push to the branch starts
  no Canary run.

## Workflow follow-up

- Ask CIP IT to allowlist `%LOCALAPPDATA%\Mini-Me Canary\sidecar\python\python.exe` before
  inviting testers.
- Archive the change, then delete `openspec/specs/dev-channel/`, left with no requirements.
- Mark the "Canary channel" row Done in `docs/roadmap.md`.
- Open the pull request into `dev`; the first merge that changes code makes the first Canary build
  from `dev`.
