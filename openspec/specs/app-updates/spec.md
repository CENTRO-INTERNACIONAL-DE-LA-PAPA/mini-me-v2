# app-updates Specification

## Purpose

Defines how an installed Mini-Me finds, downloads, verifies and installs a newer published
release, and what the user sees while that happens.

## Requirements

### Requirement: Checking for updates
A release build of Mini-Me SHALL check for a newer published release when it starts and
every 4 hours while it is open. A development build, and Mini-Me Dev, SHALL NOT check. A failed check
(offline, GitHub unreachable) SHALL be logged, SHALL show nothing to the user, and SHALL be
retried at the next scheduled check.

#### Scenario: Offline at launch
- **WHEN** a release build starts without network access
- **THEN** the user sees no update message or error, and the app works normally

#### Scenario: Already up to date
- **WHEN** the latest published release has the same version as the running app
- **THEN** nothing is downloaded and no update message is shown

### Requirement: Automatic download with progress
When a newer published release is found, the app SHALL download its update for the
current platform without asking. While it downloads, the UI SHALL show that an update to
that version is downloading, with its progress in whole percent.

#### Scenario: Download progress
- **WHEN** the app finds version 0.3.0 while running 0.2.0
- **THEN** the UI shows "Downloading update 0.3.0" with a percentage rising to 100

### Requirement: Updates are verified
The app SHALL install an update only if its signature verifies against the update public
key built into the app. An update that fails verification SHALL be discarded, logged and
not offered again until the next check.

#### Scenario: Tampered update
- **WHEN** a downloaded update's signature does not match the built-in public key
- **THEN** it is not installed, and the user keeps the running version

### Requirement: Restart to finish
Once an update is downloaded and verified, the UI SHALL show that the version is ready and
offer to restart now. Restarting SHALL end the sidecar as on any app exit, install the
update and open the new version. Replies still streaming are ended as on any app exit.

#### Scenario: Restart now
- **WHEN** the user chooses to restart after 0.3.0 is downloaded
- **THEN** Mini-Me closes, no sidecar process remains, and Mini-Me 0.3.0 opens

### Requirement: Install on close
If the user closes the app while an update is downloaded but not installed, the app SHALL
install it while closing, so the next launch opens the new version.

#### Scenario: Close instead of restarting
- **WHEN** 0.3.0 is downloaded, the user ignores the restart offer and closes Mini-Me
- **THEN** the next time they open Mini-Me it is version 0.3.0

### Requirement: Update status
The Rust core SHALL track the update status and let the UI read it and receive every
change. The status SHALL be one of:
- `{ state: "none" }`: no update in progress;
- `{ state: "downloading", version, percent }`: `percent` from 0 to 100, or `null` when
  the size is unknown;
- `{ state: "ready", version }`: downloaded and verified, waiting for a restart.

A failed download SHALL return the status to `none`, be logged, and be retried at the next
check.

#### Scenario: Status after a failed download
- **WHEN** the connection drops while an update is downloading
- **THEN** the download indicator disappears and the update is tried again at the next
  check

### Requirement: Updates stay out of Projects
Downloading and installing updates SHALL NOT read or write anything in the Mini-Me Data
folder, and an update SHALL leave all Projects, settings and logs in place.

#### Scenario: Projects after an update
- **WHEN** Mini-Me is updated
- **THEN** every Project and Conversation from before the update opens unchanged

### Requirement: The app shows its version
Settings SHALL have an About page, last in its list, showing a short description of what
Mini-Me is, the running app's name and version, such as "Mini-Me 0.4.0" or "Mini-Me Dev
0.4.0", with a "What's new" button next to the version that opens the What's new page, and last
that Mini-Me is a collaboration between the International Potato Center (CIP) and Ai2, with both
institutions' logos side by side.

#### Scenario: Checking which app is running
- **WHEN** the user opens Settings → About in Mini-Me Dev at version 0.4.0
- **THEN** the About page shows "Mini-Me Dev 0.4.0", and the CIP and Ai2 logos

#### Scenario: Reading the changes again
- **WHEN** the user clicks "What's new" next to the version in Settings → About
- **THEN** the What's new page opens with the bundled notes, and closing it returns to About

### Requirement: The changelog is bundled
Every build of Mini-Me SHALL contain the text of `CHANGELOG.md` as it was when the build was made,
so that it can be read without a network connection.

#### Scenario: Offline
- **WHEN** the user opens What's new with no network connection
- **THEN** the notes of the installed version are shown

### Requirement: What's new after an update
The first time Mini-Me starts after its version changed from the one it last showed, the app SHALL
open a "What's new" page with the bundled notes, and the core SHALL then remember the current
version as shown, so the page does not open again on its own. The page SHALL have a button that
closes it. It SHALL NOT open on its own on a fresh install, whose first launch records the current
version as shown, and SHALL NOT open in Mini-Me Dev. An install that kept its settings from before
the app remembered a version SHALL be treated as updated.

#### Scenario: After an update
- **WHEN** the app has updated from 0.5.2 to 0.6.0 and is started
- **THEN** the What's new page shows the notes of 0.6.0, and the next start does not open it

#### Scenario: Fresh install
- **WHEN** Mini-Me is started for the first time on a computer
- **THEN** no What's new page opens

#### Scenario: Mini-Me Dev
- **WHEN** Mini-Me Dev is started at a version it has not shown before
- **THEN** no What's new page opens

#### Scenario: Dismissing
- **WHEN** the user closes the What's new page
- **THEN** the app shows what it showed before it, or Home

### Requirement: Third-party Software page
Settings → About SHALL have a "Third-party Software" row that opens a page inside Mini-Me. The
page SHALL show Mini-Me's notice and license, then a table of contents of the third-party
components grouped by part of the app (core, interface, AI runtime), then a section for each
component with its name, version, a link to its repository when it has one, and its license
text. Clicking an entry of the table of contents SHALL go to its section. In a build without
the file, such as a development build, the page SHALL say the list comes with released builds.

#### Scenario: Finding a license
- **WHEN** the user opens "Third-party Software" in a released build and clicks `pandas` in the
  table of contents
- **THEN** the page goes to the `pandas` section, with its version, repository link and license
  text

#### Scenario: A development build
- **WHEN** the user opens "Third-party Software" in a build without the file
- **THEN** the page says the list comes with released builds
