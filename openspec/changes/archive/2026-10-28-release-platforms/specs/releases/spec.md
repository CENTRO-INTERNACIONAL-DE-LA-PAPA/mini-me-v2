# Spec Delta

## MODIFIED Requirements

### Requirement: Releases are built from version tags
Pushing a tag of the form `v<major>.<minor>.<patch>` SHALL build the release installers on
GitHub-hosted runners and create a draft GitHub Release for that version, holding the
installers and the update files. No release SHALL be built from anything other than such a
tag.

#### Scenario: Tag pushed
- **WHEN** the maintainer pushes the tag `v0.2.0`
- **THEN** a draft release "Mini-Me 0.2.0" appears on GitHub with the Windows, macOS and
  Linux installers and their update files

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
