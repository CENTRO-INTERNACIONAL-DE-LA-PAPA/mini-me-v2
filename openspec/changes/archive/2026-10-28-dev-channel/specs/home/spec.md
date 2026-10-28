# Spec Delta

## MODIFIED Requirements

### Requirement: Showing Mini-Mes on Home is a setting
Settings' General page SHALL have a "Show Mini-Mes on Home" switch, off by default
and stored in the app's settings outside Mini-Me Data. While it is on, the Mini-Mes SHALL
appear each time Home is shown; while it is off, they SHALL NOT appear on their own.

#### Scenario: Default
- **WHEN** the app is used for the first time and Home is shown
- **THEN** no Mini-Mes appear

#### Scenario: Turned on
- **WHEN** the user turns "Show Mini-Mes on Home" on and returns to Home
- **THEN** the Mini-Mes drop in, and they do so again after a restart
