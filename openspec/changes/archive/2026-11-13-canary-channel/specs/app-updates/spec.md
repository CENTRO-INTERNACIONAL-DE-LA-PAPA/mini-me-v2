# Spec Delta

## MODIFIED Requirements

### Requirement: Checking for updates
A release build of Mini-Me SHALL check for a newer published release when it starts and
every 4 hours while it is open. A release build of Mini-Me Canary SHALL check on the same
schedule for a newer Canary build, as the `canary-channel` spec defines. A development build
SHALL NOT check. A failed check (offline, GitHub unreachable) SHALL be logged, SHALL show nothing
to the user, and SHALL be retried at the next scheduled check.

#### Scenario: Offline at launch
- **WHEN** a release build starts without network access
- **THEN** the user sees no update message or error, and the app works normally

#### Scenario: Already up to date
- **WHEN** the latest published release has the same version as the running app
- **THEN** nothing is downloaded and no update message is shown

### Requirement: The app shows its version
Settings SHALL have an About page, last in its list, showing a short description of what
Mini-Me is, the running app's name and version, such as "Mini-Me 0.4.0" or "Mini-Me Canary
a1b2c3d", with a "What's new" button next to the version that opens the What's new page,
and last that Mini-Me is a collaboration between the International Potato Center (CIP) and Ai2,
with both institutions' logos side by side.

#### Scenario: Checking which app is running
- **WHEN** the user opens Settings → About in a Mini-Me Canary built from commit `a1b2c3d`
- **THEN** the About page shows "Mini-Me Canary a1b2c3d", and the CIP and Ai2 logos

#### Scenario: Reading the changes again
- **WHEN** the user clicks "What's new" next to the version in Settings → About
- **THEN** the What's new page opens with the bundled notes, and closing it returns to About

### Requirement: What's new after an update
The first time Mini-Me starts after its version changed from the one it last showed, the app SHALL
open a "What's new" page with the bundled notes, and the core SHALL then remember the current
version as shown, so the page does not open again on its own. The page SHALL have a button that
closes it. It SHALL NOT open on its own on a fresh install, whose first launch records the current
version as shown, and SHALL NOT open in Mini-Me Canary. An install that kept its settings from
before the app remembered a version SHALL be treated as updated.

#### Scenario: After an update
- **WHEN** the app has updated from 0.5.2 to 0.6.0 and is started
- **THEN** the What's new page shows the notes of 0.6.0, and the next start does not open it

#### Scenario: Fresh install
- **WHEN** Mini-Me is started for the first time on a computer
- **THEN** no What's new page opens

#### Scenario: Mini-Me Canary
- **WHEN** Mini-Me Canary is started at a version it has not shown before
- **THEN** no What's new page opens

#### Scenario: Dismissing
- **WHEN** the user closes the What's new page
- **THEN** the app shows what it showed before it, or Home
