# Spec Delta

## MODIFIED Requirements

### Requirement: Listing recent Conversations across Projects
The Rust core SHALL list the 5 most recently active Conversations across all Projects of the
Project list, most recent first, each with its ID and title, its Project's ID and name, and its
status, given as for a Project's Conversation list. Listing SHALL only read each
`project.sqlite`, skipping Projects that cannot be read or whose schema is newer than the app's,
and SHALL NOT change any Project file.

#### Scenario: Conversations in three Projects
- **WHEN** three Projects hold eight Conversations in all
- **THEN** the 5 with the latest activity are listed, newest first, each with its Project

#### Scenario: Project from a newer app version
- **WHEN** one Project's database is newer than the app supports
- **THEN** its Conversations are not listed and its files are unchanged

#### Scenario: A running reply in another Project
- **WHEN** a reply is running in a Conversation of "Late blight resistance" that is among the 5
  most recent
- **THEN** that Conversation is listed with the status `running` and its Mini-Me

### Requirement: Recent conversations in Home's sidebar
With no Project open, the sidebar SHALL show a "Recent" group listing the recent
Conversations, each with its title and its Project's name, fetched each time Home is shown and
each time the running replies change while it is shown. A Conversation with a status SHALL show
it under its title in place of its Project's name and time, as in a Project's Conversation list:
the avatar of the status's Mini-Me, then "Running" or "Needs your approval"; a Conversation
without one SHALL show its Project's name and time. Clicking one SHALL open its Project and show
that Conversation. With no Conversations, the group SHALL be left out.

#### Scenario: Jumping back in
- **WHEN** the user clicks "Literature" from "Late blight resistance" in the Recent group
- **THEN** "Late blight resistance" is opened and "Literature" is shown

#### Scenario: No Conversations yet
- **WHEN** no Project has a Conversation
- **THEN** the sidebar shows Home and no Recent group

#### Scenario: A reply that needs the user
- **WHEN** Investigator's reply in "Trial design" of "Late blight resistance" waits for an
  approval and the user is on Home
- **THEN** its row in the Recent group shows Investigator's avatar and "Needs your approval"
  instead of "Late blight resistance" and the time

#### Scenario: Nothing running
- **WHEN** no reply in a recent Conversation is running or paused
- **THEN** its row shows its Project's name and time, as before
