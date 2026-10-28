# Spec Delta

## Purpose

Defines Mini-Me Dev, the app development runs as: its own identity and data, kept apart from
the installed Mini-Me so development never touches real Projects, settings or keys.

## ADDED Requirements

### Requirement: Mini-Me Dev is a separate app
Mini-Me Dev SHALL be built from the same code as Mini-Me, with the identifier
`org.cipotato.mini-me.dev`, the name "Mini-Me Dev" and the development icon, so it can run
next to an installed Mini-Me without affecting it.

#### Scenario: Both running
- **WHEN** Mini-Me is installed and open, and the developer starts Mini-Me Dev
- **THEN** both run at once, each with its own name and icon

### Requirement: Mini-Me Dev keeps its own data
Mini-Me Dev SHALL keep its Projects in `Mini-Me Data (Dev)` in the Documents folder, and its
settings, logs and keychain entries under its own identifier. It SHALL NOT read or write
Mini-Me's `Mini-Me Data` folder, settings, logs or keychain entries.

#### Scenario: Schema upgrade in Mini-Me Dev
- **WHEN** a Mini-Me Dev build upgrades the database schema of the Projects it opens
- **THEN** Mini-Me's Projects are unchanged and Mini-Me still opens them

#### Scenario: Keys are separate
- **WHEN** the user saves an OpenAI key in Mini-Me Dev
- **THEN** Mini-Me's Settings do not show an OpenAI key unless one was saved there

### Requirement: Local runs are Mini-Me Dev
Running the app from the source tree for development (`npm run tauri:dev`) SHALL run it as
Mini-Me Dev, with Mini-Me Dev's data, settings and keychain entries.

#### Scenario: Developing next to the installed app
- **WHEN** the developer runs `npm run tauri:dev` while Mini-Me is installed
- **THEN** the running app is titled "Mini-Me Dev" and shows Mini-Me Dev's Projects, not
  Mini-Me's

### Requirement: Mini-Me Dev does not update itself
Mini-Me Dev SHALL NOT check for or install updates, and SHALL never install a Mini-Me
release.

#### Scenario: New Mini-Me release
- **WHEN** a new Mini-Me release is published while Mini-Me Dev is running
- **THEN** Mini-Me Dev shows no update and keeps running as it is

### Requirement: Developer mode
Settings → About SHALL have a "Developer mode" switch, stored in each app's own settings. Until
the user sets it, it SHALL be on in Mini-Me Dev and off in Mini-Me. Every developer option
SHALL be in the Developer section of Settings → General, with a name starting with "[DEBUG]",
and SHALL be hidden while Developer mode is off.

#### Scenario: Defaults
- **WHEN** Mini-Me and Mini-Me Dev are opened for the first time
- **THEN** Developer mode is off in Mini-Me and on in Mini-Me Dev

#### Scenario: Turned on in Mini-Me
- **WHEN** the user turns Developer mode on in Mini-Me
- **THEN** "[DEBUG] Jev's confidence threshold", "[DEBUG] Show Jev's answers" and "[DEBUG]
  Avatars" appear in Settings → General → Developer, and stay after a restart

### Requirement: Jev's answers need Developer mode
Jev's raw answers SHALL be stored with a message, and shown under it as "[DEBUG] Jev", only
while both Developer mode and "[DEBUG] Show Jev's answers" are on. Answers stored earlier SHALL
be hidden while Developer mode is off.

#### Scenario: Developer mode turned off
- **WHEN** "[DEBUG] Show Jev's answers" is on and the user turns Developer mode off
- **THEN** new messages store no Jev answers, and no message shows "[DEBUG] Jev"

### Requirement: Avatars page in Settings
The avatar parts page SHALL be opened from Settings → General as "[DEBUG] Avatars" while
Developer mode is on, and SHALL return to Settings when closed. The sidebar SHALL NOT offer it.

#### Scenario: Opening the Avatars page
- **WHEN** Developer mode is on and the user clicks Open next to "[DEBUG] Avatars"
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
