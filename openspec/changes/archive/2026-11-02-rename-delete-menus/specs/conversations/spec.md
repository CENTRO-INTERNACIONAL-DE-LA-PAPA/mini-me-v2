# Spec Delta

## ADDED Requirements

### Requirement: Renaming a Conversation
Each Conversation SHALL have a "…" menu with Rename, in its sidebar row and in its header. Renaming
SHALL set its title, trimmed and not empty, which the sidebar and the header then show. It SHALL be
stored in the Project's database without events.

#### Scenario: Rename
- **WHEN** the user renames "New conversation" to "Yield by altitude"
- **THEN** the sidebar and the header show "Yield by altitude"

### Requirement: Deleting a Conversation
The same menu SHALL offer Delete. After confirmation, deleting SHALL stop its running reply and remove
the Conversation with its messages, events, reactions, components and steps. Files its replies saved
SHALL stay in the Project.

#### Scenario: Delete
- **WHEN** the user confirms deleting a Conversation with three messages
- **THEN** it is gone from the sidebar, its messages and events are removed, and its saved files remain
  in Files

#### Scenario: Asking first
- **WHEN** the user picks Delete
- **THEN** a confirmation appears, and nothing is removed until it is accepted
