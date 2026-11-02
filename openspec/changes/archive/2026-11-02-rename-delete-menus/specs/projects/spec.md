# Spec Delta

## MODIFIED Requirements

### Requirement: Project folder names
A new Project's folder SHALL be named by the Project's ID, so that the folder name never changes and
never collides. The Project's name SHALL be stored only in its database. Projects created before this
change SHALL keep their folders.

#### Scenario: Unsafe characters
- **WHEN** the user creates a Project named `Trials: 2026/27`
- **THEN** the folder name is the Project's ID, and the Project list shows `Trials: 2026/27`

#### Scenario: Name collision
- **WHEN** the user creates two Projects with the same name
- **THEN** each gets its own folder and both appear in the Project list

## ADDED Requirements

### Requirement: Renaming a Project
Each Project in the Project switcher SHALL have a "…" menu with Rename. Renaming SHALL change the name
stored in the Project's database, trimmed and not empty, and SHALL NOT move or rename any folder.

#### Scenario: Rename
- **WHEN** the user renames "Trial design" to "Huancayo 2025"
- **THEN** the switcher and Home show "Huancayo 2025", and the Project's folder is unchanged

### Requirement: Deleting a Project
The "…" menu SHALL offer Delete. Deleting SHALL first warn that the Project's Conversations and files
will be removed for good, and after confirmation SHALL stop its running replies and remove its folder.

#### Scenario: Delete
- **WHEN** the user confirms deleting "Trial design"
- **THEN** the Project is gone from the switcher and Home, and its folder no longer exists

#### Scenario: Cancel
- **WHEN** the user dismisses the warning
- **THEN** nothing is removed
