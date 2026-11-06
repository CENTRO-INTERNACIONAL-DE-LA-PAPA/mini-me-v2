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
  "Show Jev's answers", "Show what Jev was asked", "Show what the AI read", "Show model call
  details", "Show tool calls", "Debug data", "Sidecar log", "Avatars" and "Feature flags", and
  stays after a restart

#### Scenario: Turned off
- **WHEN** Developer mode is off
- **THEN** Settings lists General, Models & keys, Accounts and About, with no Developer page

## ADDED Requirements

### Requirement: Reply debug details need Developer mode
"Show what the AI read", "Show model call details" and "Show tool calls" SHALL each be off until
the user turns it on, and SHALL store their part of a reply's debug records only while
Developer mode is on as well. Records stored earlier SHALL be hidden while Developer mode is
off.

#### Scenario: Developer mode turned off
- **WHEN** the three reply switches are on and the user turns Developer mode off
- **THEN** new replies store no reply records, and no reply shows "[DEBUG] AI"
