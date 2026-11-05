# Spec Delta

## MODIFIED Requirements

### Requirement: Developer mode
Settings → About SHALL have a "Developer mode" switch, stored in each app's own settings. Until
the user sets it, it SHALL be on in Mini-Me Dev and off in Mini-Me. Every developer option
SHALL be on the Developer page of Settings, with a name starting with "[DEBUG]". The Developer
page SHALL be listed, just before About, only while Developer mode is on.

#### Scenario: Defaults
- **WHEN** Mini-Me and Mini-Me Dev are opened for the first time
- **THEN** Developer mode is off in Mini-Me and on in Mini-Me Dev

#### Scenario: Turned on in Mini-Me
- **WHEN** the user turns Developer mode on in Mini-Me
- **THEN** the Developer page appears in Settings, holding "[DEBUG] Jev's confidence threshold",
  "[DEBUG] Show Jev's answers", "[DEBUG] Avatars" and "[DEBUG] Feature flags", and stays after a
  restart

#### Scenario: Turned off
- **WHEN** Developer mode is off
- **THEN** Settings lists General, Models & keys, Accounts and About, with no Developer page
