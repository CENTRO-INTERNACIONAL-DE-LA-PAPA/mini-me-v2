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
0.4.0", and last that Mini-Me is a collaboration between the International Potato Center
(CIP) and Ai2, with both institutions' logos side by side.

#### Scenario: Checking which app is running
- **WHEN** the user opens Settings → About in Mini-Me Dev at version 0.4.0
- **THEN** the About page shows "Mini-Me Dev 0.4.0", and the CIP and Ai2 logos
