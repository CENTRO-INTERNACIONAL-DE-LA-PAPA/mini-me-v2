# Design

## Context

A release today: edit the version in five files, edit `CHANGELOG.md`, commit to `dev`, merge the
`dev` to `main` pull request by hand, tag the merge commit by hand, push the tag. The Release
workflow runs on that tag: its `draft` job runs `scripts/check-version.mjs`, creates the draft
release with the changelog as notes, and a three-platform `build` job uploads into it.

What reads the app version, found by looking: the Tauri config (which the app's `getVersion()`, the
updater and the installer names use) and the pinned `tauri-action`, which reads a package file
when the config's `version` ends in `.json`. Nothing in the Rust code reads `CARGO_PKG_VERSION`,
so `Cargo.toml`'s version is not the app's. `main` is not branch-protected, merge commits are
allowed, and CI runs on every pull request into `dev` or `main`. The frontend test added with the
changelog already fails a pull request whose bundled changelog is for another version than
`package.json`. See proposal.md for scope and the specs for behaviour.

## Goals / Non-Goals

**Goals:**
- One place sets the version, and everything that must agree is checked before the merge.
- The maintainer cannot tag the wrong commit, and does not tag at all.
- Preparing a release is one command, with nothing to type, that never does anything irreversible.

**Non-Goals:**
- Merging into `main` or publishing the draft: both stay manual decisions.
- A release from any branch other than `main`.
- Drafting the changelog: the maintainer writes it, in plain language, before the command.

## Decisions

**`package.json` is the single source.** `npm version <v> --no-git-tag-version` is the standard
way to set the version in `package.json` and `package-lock.json` together, so the script writes
no JSON by hand. `tauri.conf.json` gets `"version": "../package.json"`, which Tauri's config
schema allows and `tauri-action` handles. `Cargo.toml` and `Cargo.lock` are set once to a
constant, `0.0.0`, with a comment saying the app version is in `package.json`; since no code reads
it, they never change again. A Rust test checks the version the app is built with against
`package.json`, which guards the one thing not yet seen working in a real build. *Alternative:* a
sync script writing the version into all five files: rejected, it keeps five places that can drift
and needs a check that the sync ran.

**CI creates the tag, from `main`'s own contents.** The Release workflow runs on a push to `main`
and on `workflow_dispatch`. Its first job reads the version from `package.json` and asks GitHub
whether `v<version>` exists. If it does, the job ends and no later job runs. If not, it runs the
checks, creates the tag at `GITHUB_SHA` through the API, creates the draft release with the
changelog as notes, and passes its ID to the build jobs, which run only when it is set. The tag can
therefore only be on a commit on `main` that carries the version, and a merge that does not change
the version releases nothing. The tag is created with the workflow's own token, which does not start
other workflows, so a tag trigger is not kept and cannot cause a second run. A `concurrency` group
makes two quick merges run one after the other. *Alternative:* keep the tag trigger and add a
`tag` command to the script: rejected, it keeps the step that can be forgotten or mistyped.
*Alternative:* release-please: rejected, it works from commit messages on the target branch, and
this project merges `dev` into `main` with merge commits and writes its notes by hand.

**One run, and the changelog is the only input.** The maintainer writes `CHANGELOG.md` for the new
version and leaves it uncommitted, then runs `npm run release`. The version is the one in its first
line, `# Mini-Me <version>`, so the maintainer sets it in one place only and the script takes no
argument. The command fails early, changing nothing, if anything is off. The checks are that `dev` is
checked out and not behind `origin/dev`; that the working tree holds no change besides
`CHANGELOG.md`; that the first line names a version; and that the version is above the latest tag
and untagged, which is also what catches a changelog nobody updated. Then it sets the version with
`npm version`, runs the same checks as CI, commits `package.json`, `package-lock.json` and
`CHANGELOG.md` as `chore(release): <version>`, pushes `dev`, and opens the pull request into `main`,
or updates it when it is already open. Keeping the changelog out of the repository until now means
the changelog test, which compares it with `package.json`'s version, never fails on a commit of its
own. A step that fails is simply done again by running the command again: it skips the version when
`package.json` already has it, the commit when there is nothing to commit, and the push or the pull
request when they exist. *Alternative:* a version argument or `patch`, `minor` and `major`: rejected,
it gives the version two sources, the argument and the changelog, that can disagree.
*Alternative:* a script that drafts the changelog from commits and stops for the maintainer to edit
it: rejected, since it makes two runs, and the maintainer would rather write the notes first.

**Logic is a small library with tests; the script only does git and `gh`.** `scripts/release-lib.mjs`
holds the pure parts: reading the version from a changelog, comparing two versions and the check of a
set of file contents. The Vitest
tests, which already run in CI, cover it. `check-version.mjs` and `release.mjs` call it. A
`--dry-run` flag prints what the script would do and changes nothing.

**Ownership.** The script and the workflow own preparing and tagging; the app, the core and the
sidecar do not change, except for the Rust test.

## Risks / Trade-offs

- [`tauri.conf.json` reading `../package.json` has not been seen in a real build] → the Rust test
  compares the embedded version with `package.json`; if that cannot be made to work, running
  `tauri build` once locally shows it, and the fallback is a literal version again, which the script
  would also write.
- [A merge into `main` carrying a bumped version starts a build of all platforms] → intended; the
  release stays a draft, and nothing reaches users until it is published.
- [A build fails after the tag exists] → re-run the failed jobs of that run. A new run finds the tag
  and stops, so to rebuild everything the draft and the tag are deleted first, and docs say so.
- [A changelog whose first line has a typo in the version] → the version is checked to be a valid
  version above the latest tag, and the pull request shows the changelog and the version before
  anything is merged.
- [The workflow changes on `main` at the same merge that brings this change] → that first run finds
  `v0.5.2` already tagged and stops.
- [A hotfix made on `main` directly] → not supported; releases come from `dev` through the pull
  request, as the project's rules already say.
