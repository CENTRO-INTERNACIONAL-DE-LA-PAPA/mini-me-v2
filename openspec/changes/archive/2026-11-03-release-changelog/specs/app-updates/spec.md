# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
