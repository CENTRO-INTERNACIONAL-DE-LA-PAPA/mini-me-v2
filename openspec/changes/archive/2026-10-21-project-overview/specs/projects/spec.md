# Spec Delta

## MODIFIED Requirements

### Requirement: Open a Project
The user SHALL be able to open a Project from the list to see its Overview and its
Conversations. If the Project's database was created by a newer version of the app, the app
SHALL refuse to open it and tell the user to update, without modifying it. If it was created
by an older version, the app SHALL upgrade it in place before opening.

#### Scenario: Open an existing Project
- **WHEN** the user opens a Project
- **THEN** its Overview is shown and its Conversations are listed in the sidebar

#### Scenario: Database from a newer app version
- **WHEN** the user opens a Project whose database schema is newer than the app supports
- **THEN** the Project is not opened, its files are unchanged and the user is told to update
  Mini-Me
