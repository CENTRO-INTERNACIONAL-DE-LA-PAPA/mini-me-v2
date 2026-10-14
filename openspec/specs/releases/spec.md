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

### Requirement: Releases are built from version tags
Pushing a tag of the form `v<major>.<minor>.<patch>` SHALL build the release installers on
GitHub-hosted runners and create a draft GitHub Release for that version, holding the
installers and the update files. No release SHALL be built from anything other than such a
tag.

#### Scenario: Tag pushed
- **WHEN** the maintainer pushes the tag `v0.2.0`
- **THEN** a draft release "Mini-Me 0.2.0" appears on GitHub with the Windows installer
  and its update files

### Requirement: Tag matches the app version
The release build SHALL fail, publishing nothing, when the tag's version differs from the
app version in any of the app's configuration files.

#### Scenario: Mismatched tag
- **WHEN** the tag `v0.3.0` is pushed while the app's configuration says `0.2.0`
- **THEN** the build fails naming both versions, and no draft release is created

### Requirement: Drafts reach users only when published
A draft release SHALL NOT be offered to installed apps. A release SHALL be offered only
after the maintainer publishes it on GitHub.

#### Scenario: Draft not offered
- **WHEN** a draft release for a newer version exists and an installed app checks for
  updates
- **THEN** the app reports no update

### Requirement: Platforms
Each release SHALL contain a Windows installer that installs for the current user only,
without administrator rights. Releases SHALL NOT contain macOS or Linux builds; a macOS
app is built locally with `npm run tauri:release` and is not updated automatically.

#### Scenario: Windows install without administrator rights
- **WHEN** a CIP user without administrator rights runs the Windows installer
- **THEN** Mini-Me installs into the user's own local application data folder and opens

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
Windows SmartScreen shows for an unsigned app, and how to run Mini-Me anyway.

#### Scenario: First launch on Windows
- **WHEN** a user runs the installer and SmartScreen warns about an unrecognized app
- **THEN** the README's steps let them run it
