# Design

## Context

See proposal.md for the motivation.

- `src-tauri/tauri.dev.conf.json` holds the Mini-Me Dev identity (identifier, name, window
  title, icons). `npm run tauri:dev` applies it. The Rust core reads the identifier at start-up
  and derives the rest: `projects::is_mini_me_dev` (an identifier ending in `.dev`) picks the
  Projects folder, the Developer mode and feature flag defaults, and whether What's new opens;
  the keychain service is the identifier itself.
- `ipc.rs` starts update checks only in a release build of an app that is not Mini-Me Dev. The
  updater reads its feed from the Tauri config: `releases/latest/download/latest.json`.
- `release.yml` runs when `main` changes: one job tags the commit and creates a draft release,
  a matrix job builds each platform with `tauri-action`, which uploads the installers, the
  signed update files and `latest.json` into the draft. The maintainer publishes the draft.
- The version is written in three places that `check-version` keeps in step: `package.json`,
  `package-lock.json` and the first line of `CHANGELOG.md`. `tauri.conf.json` reads it from
  `package.json`; `Cargo.toml` is frozen at `0.0.0`. `npm run release` takes the version from the
  changelog, sets the other two, commits, pushes `dev` and opens the pull request into `main`.
- Tauri requires an app version of three numbers, and the updater installs a version above the
  running one.
- GitHub's `releases/latest` never resolves to a pre-release or a draft.
- A workflow can be started by hand only once its file is on the default branch, `main`. A push
  trigger works from the branch the file is on.

## Goals / Non-Goals

**Goals:**
- One word, Canary, for the app in the identifier, the names, the files, the code and the specs.
- Both channels publish without a manual step, and never with a platform missing.
- A release needs one edit, the changelog's first line, one command with nothing to remember,
  and one merge.
- Each channel has its own workflow file, and they share none.

**Non-Goals:**
- Moving a developer's Mini-Me Dev settings, keys or Projects.
- Deleting old Canary pre-releases or their tags.
- Build numbers that survive renaming the Canary workflow file.

## Decisions

### Mini-Me Dev becomes Mini-Me Canary everywhere (config, Rust core)
`tauri.dev.conf.json` is renamed `tauri.canary.conf.json`, with the identifier
`org.cipotato.mini-me.canary`, the name and window title "Mini-Me Canary" and the icons in
`icons/canary/` (from `app-icon-canary.svg`). In the Rust core, `is_mini_me_dev` becomes
`is_canary` and tests the `.canary` suffix, the folder constant becomes
`Mini-Me Data (Canary)`, and `is_dev_app` becomes `is_canary` in `ipc.rs`, `settings.rs` and
`features.rs`. `npm run tauri:dev` keeps its name: it is Tauri's "run from source" command. The
`dev` branch, Developer mode and the Developer page keep their names.

*Alternative:* rename only what users see and keep `.dev` in the identifier. Rejected: the
identifier shows in the settings and log paths and in keychain entries, and it cannot change
once testers have installed the app without orphaning their data.

### Local runs and installed builds are the same app (config)
`npm run tauri:dev` and a published Canary build share the identifier, so they share
`Mini-Me Data (Canary)`, settings and keys on one machine.

*Alternative:* a third identity for local runs. Rejected for now: a third config and icon set to
keep; it can be split later without affecting testers.

### Every release build checks for updates (Rust core)
`AppState::init` starts update checks when the build is a release build, whichever app it is.
`tauri.canary.conf.json` overrides `plugins.updater.endpoints` with
`releases/download/canary/latest.json`, so Mini-Me Canary reads its own feed. A config given
with `--config` replaces arrays, so Mini-Me's feed is not kept alongside it. A debug build
(`tauri:dev`) still never checks.

### The version is typed in the changelog and copied by one command (scripts)
`package.json` keeps the app's version, and `check-version` keeps checking, on every pull
request, that `package-lock.json` and the first line of `CHANGELOG.md` agree with it.
`npm run sync-version` (`scripts/sync-version.mjs`) takes no argument: it reads the version from
the changelog's first line with `changelogVersion` and sets it with
`npm version <version> --no-git-tag-version`, so nothing is committed or tagged. When the
versions already agree it says so and changes nothing.

`CHANGELOG.md` is edited in the pull requests that make the changes, under the heading of the
last release; the first change after a release replaces the old notes. To release: give the
heading the new version, run `npm run sync-version`, and merge `dev` into `main`. Forgetting the
command fails the pull request's checks, which name both versions.

`scripts/release.mjs`, the `release` script in `package.json`, and `releaseVersion`,
`latestVersion` and `compareVersions` in `release-lib.mjs` with their tests are deleted.
`release.yml` reads the version from `package.json` as today.

*Alternatives:* `package.json` at `0.0.0` with the version stamped at build time. Rejected:
`package.json` would not say which version the code is. A command that takes the version as an
argument. Rejected: the version would be typed twice, or the changelog rewritten by a script.

### A Mini-Me release publishes itself (workflow)
`release.yml` gains a `publish` job that needs every build job and turns the draft into the
latest release. A failed platform skips it, so the release stays a draft; re-running the failed
jobs runs it afterwards.

The newest Canary build is the code about to be released. Trying it before merging `dev` into
`main` replaces trying the draft's installers.

*Alternative:* keep the draft for the maintainer to publish. Rejected: one more manual step, and
a draft missing a platform could be published.

### Canary builds are named by their commit (workflow, UI)
A Canary build is known by the first 7 characters of its commit's hash: the pre-release is
"Mini-Me Canary a1b2c3d", tagged `canary-a1b2c3d`. When that tag exists, the `draft` job stops
and nothing is built, as `release.yml` does for a version already tagged.

A hash says nothing about order, and the updater installs only a version above the running one.
So each build is also stamped with the version `0.0.<number>`, where the number is the Canary
workflow's `github.run_number`: it rises by one per run and stays the same when failed jobs are
re-run. It shows only in the installers' file names.

The workflow gives the hash to the UI's build as the environment variable `VITE_COMMIT`. In the
UI, Settings → About shows "Mini-Me Canary" followed by that hash, or "(local)" when the build
has none, in place of the version; Mini-Me shows its version as today.

*Alternatives:* a release-style version, such as `0.7.1-canary.42`. Rejected: it reads like a
Mini-Me version and needs a rule for which version it is ahead of. The build number as the
name. Rejected: a number does not say which commit a tester is running. The hash inside the
version, as `0.0.42+a1b2c3d`. Rejected: the `+` does not survive in the names of GitHub's
release files.

### One pre-release per build, and a fixed one for the feed (workflow)
`canary.yml` has three jobs:

1. `draft`: stops when the tag `canary-<hash>` exists; otherwise deletes Canary drafts left by
   cancelled or failed runs, and creates a draft pre-release named "Mini-Me Canary <hash>" with
   the tag name `canary-<hash>` and the commit as its target. GitHub creates the tag itself when
   the draft is published, so a failed run leaves no tag.
2. `build`: one job per platform, with the same runners, bundles and pinned actions as
   `release.yml`. It stamps the version and sets `VITE_COMMIT`, then builds with the Canary config before the release
   and CI configs, uploading into the draft.
3. `publish`, only when every build succeeded: publishes the draft as a pre-release that is not
   the latest release, then copies its `latest.json` to the fixed pre-release tagged `canary`,
   creating it the first time.

`latest.json` holds the full download URL of each update file, so the copy in the `canary`
pre-release points at the files of the build's own pre-release.

The workflow runs on a push to `dev` that changes anything outside `**/*.md`, `docs/**` and
`openspec/**`, and on `workflow_dispatch`. Its concurrency group cancels a build in progress
when a newer push arrives.

A build is published only when every platform built, so all platforms are always on the same
build. Canary pre-releases and tags are kept: GitHub lists pre-releases apart from the latest
release, and an older build stays downloadable to find when a bug appeared.

*Alternatives:* a nightly build, or one started only by hand; publishing the platforms that
built; one rolling pre-release whose files are replaced; keeping only the newest builds.
Rejected: testers would wait for changes already merged, platforms would differ, no tag would
name the build, and pruning is not needed.

### Each channel has its own workflow file, and the two read alike (workflow)
`canary.yml` and `release.yml` share no reusable workflow or action, so a change to Canary's
builds cannot break a Mini-Me release. They have the same three jobs with the same steps in the
same order, and the same three safeguards:

- a newer change cancels a build still in progress, so the newest commit is the one published;
- the tag is created when the draft is published, so a failed build leaves no tag, and the same
  version or commit can simply be built again;
- drafts left by cancelled or failed runs are deleted when the next build starts.

For `release.yml` these replace creating the tag up front and queueing runs. What differs
between the files is only what each channel needs: the branch, the ignored paths, where the name
comes from (`package.json` and `check-version`, or the commit), the notes, the version stamp and
`VITE_COMMIT`, the Canary config, and the copy of `latest.json` to the feed. A change to the
pinned actions, the Linux packages or the bundle list is made in both files.

*Alternatives:* a reusable workflow called by both. Rejected: it would put the production release
behind a file that Canary work also edits. Leaving `release.yml` as it was. Rejected: a failed
release left a tag that had to be deleted by hand, and the two files would handle failure
differently.

### Both apps share the update signing key (workflow, config)
Canary builds are signed with the key Mini-Me's releases use, and `tauri.canary.conf.json`
keeps the public key of `tauri.conf.json`. The two apps stay apart through their feeds: neither
feed ever lists the other app's files.

*Alternative:* a second key pair for Mini-Me Canary. Rejected: two more secrets to keep, and a
lost Canary key would make every tester reinstall by hand.

### What's new stays closed in Mini-Me Canary (Rust core)
`take_whats_new` keeps returning false in Mini-Me Canary, as it did in Mini-Me Dev: the bundled
changelog describes a release, not the build.

### Trying the workflow before it reaches dev (workflow)
`canary.yml` cannot be started by hand until it is on `main`, and its push trigger names `dev`.
To verify it before the pull request, the feature branch is added to the push trigger for the
trial and removed before the pull request. The trial publishes real Canary pre-releases, which
can be deleted on GitHub afterwards.

## Risks / Trade-offs

- [A release that builds but does not start reaches every user, and the updater cannot go back]
  → Try the newest Canary build before merging into `main`; a fix is a new patch release.
- [The `publish` job of `release.yml` first runs for real at the next release] → It is one `gh`
  call; if it fails, the draft is complete and can be published by hand.
- [The version is not raised before merging into `main`] → Nothing is built, and the workflow's
  log says the version is already tagged; raise it and merge again.
- [The first release after this change deletes the draft "Mini-Me 0.6.0", left on GitHub since
  0.6.1 replaced it] → Intended: it is a leftover draft. Delete or publish it beforehand to decide
  its fate by hand.
- [The two build jobs drift apart, such as an action pinned to a new version in one file only] →
  Each file says in a comment that the other holds the same job.
- [Renaming or recreating `canary.yml` restarts `run_number`, so new builds look older and are
  not installed] → Do not rename the file.
- [One tag and one pre-release are added per Canary build, for good] → Accepted.
- [A bad merge reaches every tester within 4 hours] → Accepted: that is what Canary is for. The
  next merge replaces it, and an older build can be reinstalled from its pre-release.
- [A local run from a feature branch upgrades the database of the developer's installed Canary]
  → Accepted with the shared identity; only the developer's Canary data is affected.
- [Mini-Me Canary's `python.exe` is blocked on CIP Windows machines] → Ask IT to allowlist
  `%LOCALAPPDATA%\Mini-Me Canary\sidecar\python\python.exe` before inviting testers.
- [Both apps trust the same update key, so a Canary app would accept a signed Mini-Me update file]
  → Its feed never lists one, and Mini-Me's installer installs into Mini-Me's own folder.

## Migration Plan

1. On a developer's machine, after the rename: Mini-Me Canary starts empty. To keep Projects,
   rename `Documents/Mini-Me Data (Dev)` to `Mini-Me Data (Canary)` before the first run. Enter
   the API keys and the Ai2 sign-in once. The old settings folder and keychain entries under
   `org.cipotato.mini-me.dev` can be deleted.
2. Rollback: revert the pull request. Published Canary pre-releases and the `canary` pre-release
   can be deleted on GitHub; no Mini-Me release or tag is involved.
3. At archive, delete `openspec/specs/dev-channel/`, which is left with no requirements.
