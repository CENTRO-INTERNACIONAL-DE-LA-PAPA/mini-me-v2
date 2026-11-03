# Spec Delta

## ADDED Requirements

### Requirement: A script prepares a release
`npm run release` SHALL prepare a release from the `dev` branch in one run, taking the version
from the first line of `CHANGELOG.md`, `# Mini-Me <version>`, and asking for no other input. It SHALL
refuse, changing nothing, unless `dev` is checked out and not behind `origin/dev`, the working
tree has no change besides `CHANGELOG.md`, and the changelog's version is a version above the
latest tag and untagged. Otherwise it SHALL set that version in `package.json` and
`package-lock.json`, commit `chore(release): <version>` to `dev`, push `dev`, and open the pull request
from `dev` into `main` with the changelog as its body, or update that pull request when it exists. It
SHALL NOT merge, tag or publish anything. When a step fails, running the same command again SHALL
skip the steps already done.

#### Scenario: Preparing a release
- **WHEN** the maintainer has written `CHANGELOG.md` starting `# Mini-Me 0.6.0` and runs
  `npm run release` on a current `dev`
- **THEN** `chore(release): 0.6.0` is committed to `dev` and pushed, with 0.6.0 in `package.json` and
  `package-lock.json`, and the pull request from `dev` into `main` is open with the changelog as its body

#### Scenario: Changelog not written yet
- **WHEN** the latest tag is `v0.5.2` and `CHANGELOG.md` still starts `# Mini-Me 0.5.2`
- **THEN** it changes nothing, and says 0.5.2 is already released and the changelog must be written
  for a newer version first

#### Scenario: A first line that names no version
- **WHEN** `CHANGELOG.md` does not start with `# Mini-Me ` followed by a version
- **THEN** it changes nothing and says what the first line must be

#### Scenario: Wrong place
- **WHEN** the command is run on a branch other than `dev`, with `dev` behind `origin/dev`, or with
  other files changed than `CHANGELOG.md`
- **THEN** it changes nothing and says why

#### Scenario: A step fails
- **WHEN** the push fails after the commit was made, and the maintainer runs the command again
- **THEN** it does not commit again, and goes on with the push and the pull request

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
  on GitHub with the Windows, macOS and Linux installers and their update files

#### Scenario: Version already tagged
- **WHEN** a change is merged into `main` while the version in `package.json` already has a tag
- **THEN** the workflow creates no tag and no draft release, and builds nothing

#### Scenario: A failed build
- **WHEN** one platform's build fails after the tag and the draft release were created
- **THEN** re-running the failed jobs of that run builds it again into the same draft release

### Requirement: The app version is set in one place
`package.json` SHALL be the one place the app version is set: `package-lock.json` SHALL carry the same
version, and `src-tauri/tauri.conf.json` SHALL take its version from `package.json`. The release
build SHALL fail, creating no tag and no draft release, when the lock file's version differs from
`package.json`'s or the Tauri configuration does not take its version from `package.json`. The same
check SHALL run on every pull request.

#### Scenario: Lock file out of step
- **WHEN** `package.json` says `0.3.0` while `package-lock.json` says `0.2.0`
- **THEN** the check fails naming both versions, on the pull request and in the release build

#### Scenario: The app shows the version
- **WHEN** `package.json` says `0.6.0` and the app is built
- **THEN** the installed app, its installer and its update file are all version 0.6.0

## REMOVED Requirements

### Requirement: Releases are built from version tags
**Reason**: A release is no longer started by a tag pushed by hand. The workflow creates the tag
itself when `main` carries a version nothing is tagged with yet.
**Migration**: See "Releases are built when main carries a new version".

### Requirement: Tag matches the app version
**Reason**: The tag is now created from the version in `package.json`, so it cannot differ from it.
What is checked instead is that the files that follow `package.json` do.
**Migration**: See "The app version is set in one place".

## MODIFIED Requirements

### Requirement: Release notes come from the changelog
The repository SHALL have a `CHANGELOG.md` holding only the notes of the release it is committed
for, under a first heading `# Mini-Me <version>`, followed by sections named "New", "Improved" and
"Fixed", each left out when empty, written in plain language for users. The draft GitHub Release
SHALL carry that text as its notes. The release build SHALL fail, creating no tag and no draft
release, when the heading's version differs from the app version in `package.json`. The same check
SHALL run on every pull request.

#### Scenario: Notes on the draft
- **WHEN** `main` carries version 0.6.0 with no tag and `CHANGELOG.md` starts with `# Mini-Me 0.6.0`
- **THEN** the draft release "Mini-Me 0.6.0" shows the changelog's text as its notes

#### Scenario: Changelog for another version
- **WHEN** `main` carries version 0.6.0 while `CHANGELOG.md` starts with `# Mini-Me 0.5.2`
- **THEN** the build fails naming both versions, and no tag and no draft release is created
