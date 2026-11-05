# Spec Delta

## Purpose

Lets a release carry experimental features that stay off until a tester enters the feature's own
key, so chosen testers try them in the same build everyone else has.

## ADDED Requirements

### Requirement: Feature flag list
The app SHALL carry a fixed list of feature flags, each with an ID, a name, a one-line description
and its key. A release MAY carry no flags.

#### Scenario: Flag with its key
- **WHEN** a developer adds a flag with the ID "dark-theme" and the key "night-owl"
- **THEN** entering "night-owl" in the Feature flags section turns "dark-theme" on

#### Scenario: No flags
- **WHEN** a release carries no feature flags
- **THEN** the Feature flags section shows the key field and says no feature flags are active

### Requirement: Turning a flag on with its key
Entering a key SHALL turn on the one flag whose key it is, ignoring spaces before and
after it. A key that matches no flag SHALL turn nothing on and SHALL say the key is not valid.
Entering the key of a flag that is already on SHALL change nothing.

#### Scenario: Right key
- **WHEN** the tester enters the key of the flag "Dark theme"
- **THEN** "Dark theme" is on and listed among the active flags, and no other flag changes

#### Scenario: Wrong key
- **WHEN** the tester enters a key that matches no flag
- **THEN** no flag turns on and the section says "This key doesn't match any feature flag."

### Requirement: Turning a flag off
Each active flag SHALL be listed with its name and description and a way to turn it off. Turning a
flag off SHALL remove it from the list, and turning it on again SHALL need its key.

#### Scenario: Turned off
- **WHEN** the tester turns off an active flag
- **THEN** the flag is off, it leaves the list, and only entering its key turns it on again

### Requirement: Flags persist
Which flags are on SHALL be stored in the app's own settings and SHALL stay the same after a
restart and after an update. A flag stays on while Developer mode is off. A stored flag that a
later version no longer carries SHALL be ignored.

#### Scenario: Restart
- **WHEN** the tester turns a flag on and restarts the app
- **THEN** the flag is still on

#### Scenario: Developer mode turned off
- **WHEN** a flag is on and the tester turns Developer mode off
- **THEN** the flag stays on, and the Feature flags section is hidden with the Developer page

### Requirement: Defaults in Mini-Me and Mini-Me Dev
In Mini-Me every flag SHALL be off until its key is entered. In Mini-Me Dev every flag SHALL be on
until it is turned off, and a flag turned off there SHALL need its key to turn on again. A flag
added in a later version SHALL start on in Mini-Me Dev.

#### Scenario: First launch
- **WHEN** Mini-Me and Mini-Me Dev are opened for the first time
- **THEN** no flag is on in Mini-Me and every flag is on in Mini-Me Dev

### Requirement: Asking whether a flag is on
The core SHALL be the only owner of which flags are on. The UI SHALL ask the core, and the
change SHALL show at once wherever the UI asks. During a Trait call, the sidecar SHALL be able to
send `core.request` with method `features.active` and empty params; the core SHALL answer with
`{ features }`, the IDs of the flags that are on.

#### Scenario: Sidecar asks
- **WHEN** a Trait asks during a call whether "dark-theme" is on, and it is
- **THEN** the core answers `{ "features": ["dark-theme"] }`

#### Scenario: UI updates
- **WHEN** the tester turns a flag on in Settings
- **THEN** every part of the UI that checks that flag shows it on without a restart
