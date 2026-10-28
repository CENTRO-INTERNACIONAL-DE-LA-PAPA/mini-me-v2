# Spec Delta

## MODIFIED Requirements

### Requirement: Editing the name in Settings
Settings' General page SHALL have a "Your name" field showing the saved name. Saving
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
