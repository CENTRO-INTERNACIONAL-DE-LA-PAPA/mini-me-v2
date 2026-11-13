# Spec Delta

## Purpose

Defines Developer mode: the switch in Settings that shows the Developer page, the debug records
of replies and of Jev's answers, the web inspector, the sidecar log and the Avatars page.

## ADDED Requirements

### Requirement: Developer mode
Settings → About SHALL have a "Developer mode" switch, stored in each app's own settings. Until
the user sets it, it SHALL be on in Mini-Me Canary and off in Mini-Me. Every developer option
SHALL be on the Developer page of Settings, named without a "[DEBUG]" prefix. The Developer
page SHALL be listed, just before About, only while Developer mode is on.

#### Scenario: Defaults
- **WHEN** Mini-Me and Mini-Me Canary are opened for the first time
- **THEN** Developer mode is off in Mini-Me and on in Mini-Me Canary

#### Scenario: Turned on in Mini-Me
- **WHEN** the user turns Developer mode on in Mini-Me
- **THEN** the Developer page appears in Settings, holding "Jev's confidence threshold",
  "Show Jev's answers", "Show what Jev was asked", "Show what the AI read", "Show model call
  details", "Show tool calls", "Debug data", "Sidecar log", "Avatars" and "Feature flags", and
  stays after a restart

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

### Requirement: Developer tools need Developer mode
While Developer mode is off, the web inspector SHALL NOT be available, by right-click or by
keyboard, and right-clicking outside a text field SHALL show no menu; text fields SHALL keep
their cut, copy and paste menu. A change to Developer mode SHALL apply to the inspector from
the next launch, and the switch SHALL say so.

#### Scenario: Inspecting with Developer mode off
- **WHEN** Developer mode is off and the user right-clicks a reply
- **THEN** no menu appears, and the inspector cannot be opened

#### Scenario: Turning it on
- **WHEN** the user turns Developer mode on in Mini-Me and restarts it
- **THEN** right-clicking shows the menu with Inspect, which opens the inspector

### Requirement: Sidecar log on the Developer page
"Sidecar log" on the Developer page SHALL open the sidecar log file in the system's
default app for it. When no log has been written yet, it SHALL say so instead. The log stays
in the app's log directory; nothing is copied into a Project folder.

#### Scenario: Opening the log
- **WHEN** the user clicks Open next to "Sidecar log"
- **THEN** the sidecar log opens in the system's default app for log files

### Requirement: Reply debug details need Developer mode
"Show what the AI read", "Show model call details" and "Show tool calls" SHALL each be off until
the user turns it on, and SHALL store their part of a reply's debug records only while
Developer mode is on as well. Records stored earlier SHALL be hidden while Developer mode is
off.

#### Scenario: Developer mode turned off
- **WHEN** the three reply switches are on and the user turns Developer mode off
- **THEN** new replies store no reply records, and no reply shows "[DEBUG] AI"
