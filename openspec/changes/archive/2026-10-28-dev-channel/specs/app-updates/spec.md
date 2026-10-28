# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: The app shows its version
Settings SHALL have an About page, last in its list, showing a short description of what
Mini-Me is, the running app's name and version, such as "Mini-Me 0.4.0" or "Mini-Me Dev
0.4.0", and last that Mini-Me is a collaboration between the International Potato Center
(CIP) and Ai2, with both institutions' logos side by side.

#### Scenario: Checking which app is running
- **WHEN** the user opens Settings → About in Mini-Me Dev at version 0.4.0
- **THEN** the About page shows "Mini-Me Dev 0.4.0", and the CIP and Ai2 logos
