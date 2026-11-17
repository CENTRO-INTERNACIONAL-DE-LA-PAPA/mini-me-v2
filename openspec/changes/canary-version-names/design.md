# Design

## Context

`canary.yml` has three jobs. `draft` names the build (`canary-<commit>`), skips a commit whose tag
exists, deletes stale drafts tagged `canary-…` and creates the draft pre-release. `build` sets the
app version to `0.0.<run number>` with `npm version` and passes the commit to the UI as
`VITE_COMMIT`. `publish` makes the draft a pre-release and copies its `latest.json` to the
`canary` feed. A release's tag is created by GitHub when its draft is published, so only
published builds have tags. Settings → About shows `appLabel(name, version, VITE_COMMIT)`
(`src/lib/format.ts`). `release.yml` deletes every draft tagged `v…` before drafting a release.

## Goals / Non-Goals

**Goals:**
- Name and order canary builds by the version on `dev` and a counter, in `canary.yml` alone,
  with no state kept outside GitHub's tags and releases.

**Non-Goals:**
- Any change to how releases are built, named or published, beyond `release.yml`'s draft filter.
- Renaming the app or the builds already published.

## Decisions

Settled with the user while planning:

- **Names.** Tag `v<version>-canary.<n>`, pre-release "Mini-Me <version>-canary.<n>", like a
  release's tag `v<version>` and name "Mini-Me <version>". The app's name stays "Mini-Me
  Canary", which keeps its install folder and shortcuts apart from Mini-Me's.
- **Settings → About** shows the build's name, "Mini-Me <version>-canary.<n>"; a run from source
  shows "Mini-Me Canary (local)".
- **`release.yml` skips canary drafts** in its cleanup, so a release cannot delete a canary
  build in progress.
- **Bumping stays manual, and a released version is refused.** When `v<version>` exists, the
  `draft` job fails with "<version> is released; bump the version on dev" and builds nothing.
  Guessing the next version (patch or minor) was turned down: the version on `dev` names the
  next release, which only the maintainer knows.

How it is built:

- **CI owns the name; the app reads its version.** The app version `<version>-canary.<n>` is set
  with `npm version` at build time, as `0.0.<run number>` is today, and never committed. The UI
  tells a canary build by `-canary.` in its version, so `VITE_COMMIT` goes away.
- **The counter comes from tags.** Only published builds have tags, so the highest `<n>` among
  tags `v<version>-canary.<n>` is the highest published build. A stopped or failed build leaves
  no tag, and its number is used again.
- **A commit is skipped when a `v…-canary.…` tag points at it.**

## Risks / Trade-offs

- [Windows MSI installers reject versions with a pre-release part] → Canary builds make only
  the NSIS installer for Windows; a comment in `canary.yml` says the bundle list must not gain
  MSI.
- [Installed copies on `0.0.<number>` must see `0.7.0-canary.1` as newer] → The updater compares
  semver versions, and 0.7.0-canary.1 > 0.0.42; the first published build confirms it.
- [The workflow can only be tried on `dev`] → The read-only steps (version, counter, skip check)
  are tried locally with `gh` against the repository before merging.

## Open Questions

Choices made while drafting, each with the recommendation the specs and tasks follow:

- **Reading the version in the `draft` job.** Recommended: read `package.json` at the commit
  with `gh api …/contents/package.json?ref=<sha>`, so the job needs no checkout. Alternative:
  check out the repository.
- **Finding tags.** Recommended: `gh api …/git/matching-refs/tags/v<version>-canary.` for the
  counter and `…/matching-refs/tags/v` filtered on `-canary.` and the commit for the skip check.
  Alternative: list releases and filter out drafts.
