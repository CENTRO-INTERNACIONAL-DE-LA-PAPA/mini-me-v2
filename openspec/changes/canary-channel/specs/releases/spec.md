# Spec Delta

## MODIFIED Requirements

### Requirement: Releases are built when main carries a new version
A release SHALL be built only when the `main` branch changes, and only when the version in
`package.json` at that commit has no tag `v<version>` yet. The release workflow SHALL then create
that tag at that commit, create a draft GitHub Release for the version holding the installers and
the update files, and build the Windows, macOS and Linux installers on GitHub-hosted runners. A
change to `main` whose version already has a tag SHALL build nothing. A release SHALL NOT be built
from a tag pushed by hand or from any branch other than `main`.

#### Scenario: A release merged into main
- **WHEN** a pull request carrying version 0.6.0 is merged into `main` and no tag `v0.6.0` exists
- **THEN** the tag `v0.6.0` is created at the merge commit and a draft release "Mini-Me 0.6.0" appears
  on GitHub with the Windows, macOS and Linux installers and their update files, and is published
  once all of them are in it

#### Scenario: Version already tagged
- **WHEN** a change is merged into `main` while the version in `package.json` already has a tag
- **THEN** the workflow creates no tag and no draft release, and builds nothing

#### Scenario: A failed build
- **WHEN** one platform's build fails after the tag and the draft release were created
- **THEN** re-running the failed jobs of that run builds it again into the same draft release,
  which is then published

### Requirement: Drafts reach users only when published
A draft release SHALL NOT be offered to installed apps. The release workflow SHALL publish the
draft as GitHub's latest release, without a manual step, once every platform's installers and
update files are in it. While any platform's build has failed, the release SHALL stay a draft.

#### Scenario: Draft not offered
- **WHEN** a draft release for a newer version exists and an installed app checks for
  updates
- **THEN** the app reports no update

#### Scenario: Every platform built
- **WHEN** the Windows, macOS and Linux builds of 0.6.0 have all finished
- **THEN** "Mini-Me 0.6.0" is published as the latest release, and installed apps are offered it at
  their next check

#### Scenario: A platform fails
- **WHEN** the Linux build of 0.6.0 fails while the Windows and macOS builds finish
- **THEN** "Mini-Me 0.6.0" stays a draft, and no installed app on any platform is offered it

## REMOVED Requirements

### Requirement: A script prepares a release
**Reason**: `CHANGELOG.md` is written as changes land, so nothing is left to prepare in one run.
**Migration**: To release, set the new version in the first line of `CHANGELOG.md`, run
`npm run sync-version`, and merge `dev` into `main`.

## ADDED Requirements

### Requirement: One command copies the changelog's version
`npm run sync-version`, run with no argument, SHALL set the version in `package.json` and
`package-lock.json` to the one in the first line of `CHANGELOG.md`, `# Mini-Me <version>`. It SHALL
NOT commit, tag or push anything. When the first line names no version of the form `x.y.z`, it
SHALL change nothing and say what the first line must be. When the versions already agree, it
SHALL change nothing and say so.

#### Scenario: Raising the version
- **WHEN** `package.json` says 0.7.0, the maintainer changes the changelog's first line to
  `# Mini-Me 0.8.0` and runs `npm run sync-version`
- **THEN** `package.json` and `package-lock.json` say 0.8.0, and nothing is committed

#### Scenario: Forgotten
- **WHEN** a pull request's changelog starts `# Mini-Me 0.8.0` while `package.json` says 0.7.0
- **THEN** its checks fail naming both versions, as they do today

#### Scenario: A first line that names no version
- **WHEN** `CHANGELOG.md` starts with `# Mini-Me next` and the maintainer runs `npm run sync-version`
- **THEN** no file changes, and it says what the first line must be
