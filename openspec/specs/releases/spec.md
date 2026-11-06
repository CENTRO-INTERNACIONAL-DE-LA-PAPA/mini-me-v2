# releases Specification

## Purpose

Defines how Mini-Me releases are built, versioned, signed for updates and published, and
what each platform's installer puts on the user's machine.

## Requirements

### Requirement: Product name
The installed app, its window, its installer and its install folder SHALL be named
"Mini-Me". The app identifier SHALL remain `org.cipotato.mini-me`, so the app's settings
and logs keep their locations.

#### Scenario: Installed app name
- **WHEN** a user installs a release
- **THEN** the app appears as "Mini-Me" in the Start menu

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

### Requirement: Drafts reach users only when published
A draft release SHALL NOT be offered to installed apps. A release SHALL be offered only
after the maintainer publishes it on GitHub.

#### Scenario: Draft not offered
- **WHEN** a draft release for a newer version exists and an installed app checks for
  updates
- **THEN** the app reports no update

### Requirement: Platforms
Each release SHALL contain a Windows installer that installs for the current user only,
without administrator rights; a macOS app and disk image for Apple silicon; and a Linux
AppImage and `.deb` for x86-64, built against a glibc old enough for Ubuntu 22.04. Installed
Windows and macOS apps and the Linux AppImage SHALL update themselves from published
releases; the `.deb` SHALL NOT.

#### Scenario: Windows install without administrator rights
- **WHEN** a CIP user without administrator rights runs the Windows installer
- **THEN** Mini-Me installs into the user's own local application data folder and opens

#### Scenario: macOS update
- **WHEN** a newer release is published and Mini-Me installed from the macOS disk image
  checks for updates
- **THEN** it downloads and installs the macOS update like the Windows app does

#### Scenario: Linux AppImage on Ubuntu 22.04
- **WHEN** a user runs the AppImage on Ubuntu 22.04
- **THEN** Mini-Me opens, and later updates itself from published releases

### Requirement: Stable bundled Python path
On Windows, the bundled Python executable SHALL be at
`%LOCALAPPDATA%\Mini-Me\sidecar\python\python.exe` for every release, so an IT allowlist
entry by path keeps working across updates.

#### Scenario: Path after an update
- **WHEN** Mini-Me is updated from one release to the next on Windows
- **THEN** the sidecar is started from the same `python.exe` path as before

### Requirement: Update files are signed
Every update file SHALL be signed with the Mini-Me update key. The release build SHALL
fail, without creating a draft release, when the signing key is not available.

#### Scenario: Missing key
- **WHEN** the release build runs without the update signing key
- **THEN** it fails and no draft release is created

### Requirement: Installers are not code-signed
Installers SHALL NOT be code-signed or notarized. The README SHALL explain the warning
Windows SmartScreen shows for an unsigned app, how to open the unsigned app on macOS, and how
to make the Linux AppImage executable, so each can be run anyway.

#### Scenario: First launch on Windows
- **WHEN** a user runs the installer and SmartScreen warns about an unrecognized app
- **THEN** the README's steps let them run it

#### Scenario: First launch on macOS
- **WHEN** macOS refuses to open Mini-Me because its developer cannot be verified
- **THEN** the README's steps let them open it

### Requirement: Third-party software ships with each release
Every release build SHALL bundle a file inside the app holding Mini-Me's `NOTICE` and license,
and each third-party component the app ships (the Rust crates of the core, the npm packages
built into the UI, and the sidecar's Python packages and runtime) with its part of the app,
name, version, repository when it has one, and the license and notice texts it ships. A
component that ships no license text SHALL be listed with the license it declares. A release
build SHALL fail when a component declares no license.

#### Scenario: A release build
- **WHEN** a release is built
- **THEN** the file lists a Rust crate such as `serde`, an npm package such as `react` and a
  Python package such as `pandas`, each with its license text

#### Scenario: A component without a license
- **WHEN** a shipped component declares no license
- **THEN** the release build fails and names the component
