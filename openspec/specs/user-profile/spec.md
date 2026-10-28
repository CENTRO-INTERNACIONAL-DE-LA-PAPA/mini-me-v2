# user-profile Specification

## Purpose
Keeps what Mini-Me knows about its user, starting with their name, in one app-wide file,
lets the user edit it in Settings, and defines where the UI shows it.

## Requirements

### Requirement: The profile file
The Rust core SHALL keep the user's profile in `user-profile.json` directly in the Mini-Me
Data folder, next to `user-library.json`. The file SHALL hold the user's name, or no name. A
missing file SHALL mean no name and SHALL NOT be created until the user saves one. The file
SHALL never be written inside a Project folder, and no Trait tool SHALL be able to address
it.

#### Scenario: First launch
- **WHEN** the app starts and Mini-Me Data has no `user-profile.json`
- **THEN** the user has no name and no file is created

#### Scenario: Name kept across restarts
- **WHEN** the user saves the name "Ana Pérez" and restarts the app
- **THEN** the name is still "Ana Pérez"

### Requirement: An unreadable profile file is kept
If `user-profile.json` cannot be read or is not a valid profile, the app SHALL treat the user
as having no name, SHALL refuse to save a name, and SHALL NOT change the file. Settings SHALL
say why the file could not be read.

#### Scenario: File broken by hand
- **WHEN** `user-profile.json` contains invalid JSON and the user opens Settings
- **THEN** Settings says the profile file could not be read, saving a name is refused, and
  the file is unchanged

### Requirement: Editing the name in Settings
Settings SHALL have a Profile page with a "Your name" field showing the saved name. Saving
SHALL trim whitespace and store a name of 1 to 100 characters; saving an empty field SHALL
clear the name. A name longer than 100 characters SHALL be refused with the reason shown.

#### Scenario: Saving a name
- **WHEN** the user types "  Ana Pérez " in "Your name" and saves
- **THEN** the saved name is "Ana Pérez"

#### Scenario: Clearing the name
- **WHEN** the user empties "Your name" and saves
- **THEN** the user has no name

#### Scenario: Too long
- **WHEN** the user saves a name of 101 characters
- **THEN** it is refused, the user sees why, and the saved name is unchanged

### Requirement: Where the name appears
The UI SHALL derive a first name (the name's first word) and initials (the first letter of the
first and last words, uppercased, or one letter for a one-word name). The sidebar's Settings
button SHALL show the initials with the tooltip "<name> · Settings", and Files SHALL show the
initials before "You" for files the user added. With no name, the Settings button SHALL show
the Settings icon with the tooltip "Settings", and Files SHALL show "You" alone.

#### Scenario: Two-word name
- **WHEN** the saved name is "Ana Pérez"
- **THEN** the Settings button shows "AP" and the tooltip "Ana Pérez · Settings"

#### Scenario: One-word name
- **WHEN** the saved name is "Ana"
- **THEN** the Settings button shows "A"

#### Scenario: No name
- **WHEN** the user has no name
- **THEN** the Settings button shows the Settings icon, and files the user added show "You"
  with no initials

#### Scenario: Name changed
- **WHEN** the user saves a new name in Settings
- **THEN** the sidebar and Files show the new initials without restarting the app

### Requirement: The name stays on the device
The name SHALL NOT be sent to the sidecar or any AI model, and SHALL NOT be written to any
event or Project file.

#### Scenario: Sending a message
- **WHEN** the user has a name and sends a message to a Mini-Me
- **THEN** the name appears in no Trait call and no event of the Conversation
