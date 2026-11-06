# Spec Delta

## MODIFIED Requirements

### Requirement: Developer mode
Settings → About SHALL have a "Developer mode" switch, stored in each app's own settings. Until
the user sets it, it SHALL be on in Mini-Me Dev and off in Mini-Me. Every developer option
SHALL be on the Developer page of Settings, named without a "[DEBUG]" prefix. The Developer
page SHALL be listed, just before About, only while Developer mode is on.

#### Scenario: Defaults
- **WHEN** Mini-Me and Mini-Me Dev are opened for the first time
- **THEN** Developer mode is off in Mini-Me and on in Mini-Me Dev

#### Scenario: Turned on in Mini-Me
- **WHEN** the user turns Developer mode on in Mini-Me
- **THEN** the Developer page appears in Settings, holding "Jev's confidence threshold",
  "Show Jev's answers", "Show what Jev was asked", "Debug data", "Sidecar log", "Avatars" and
  "Feature flags", and stays after a restart

#### Scenario: Turned off
- **WHEN** Developer mode is off
- **THEN** Settings lists General, Models & keys, Accounts and About, with no Developer page

### Requirement: Jev's answers need Developer mode
Jev's answers SHALL be stored as a debug record of the message, and shown under it in
"[DEBUG] Jev", only while both Developer mode and "Show Jev's answers" are on; what Jev
was asked, only while both Developer mode and "Show what Jev was asked" are on. Records
stored earlier SHALL be hidden while Developer mode is off.

#### Scenario: Developer mode turned off
- **WHEN** both Jev switches are on and the user turns Developer mode off
- **THEN** new messages store no Jev record, and no message shows "[DEBUG] Jev"

#### Scenario: Only one switch on
- **WHEN** Developer mode and "Show what Jev was asked" are on, and "Show Jev's
  answers" is off
- **THEN** "[DEBUG] Jev" shows what Jev was asked and no answers

### Requirement: Avatars page in Settings
The avatar parts page SHALL be opened from Settings → Developer as "Avatars" while Developer
mode is on, and SHALL return to Settings when closed. The sidebar SHALL NOT offer it.

#### Scenario: Opening the Avatars page
- **WHEN** Developer mode is on and the user clicks Open next to "Avatars"
- **THEN** the avatar parts page opens, and closing it returns to Settings

## ADDED Requirements

### Requirement: Sidecar log on the Developer page
"Sidecar log" on the Developer page SHALL open the sidecar log file in the system's
default app for it. When no log has been written yet, it SHALL say so instead. The log stays
in the app's log directory; nothing is copied into a Project folder.

#### Scenario: Opening the log
- **WHEN** the user clicks Open next to "Sidecar log"
- **THEN** the sidecar log opens in the system's default app for log files
