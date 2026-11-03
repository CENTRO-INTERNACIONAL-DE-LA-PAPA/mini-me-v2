# Spec Delta

## ADDED Requirements

### Requirement: A Conversation's status
The Rust core SHALL give each Conversation in a Project's Conversation list a status taken from
its latest reply:
- `running`, with the reply's Mini-Me (its ID and name), while that reply's run is in flight, as
  the report of running replies defines it;
- `needs_approval`, with the reply's Mini-Me, while the reply is paused at an approval;
- no status in every other case, including a reply that completed, failed or was cancelled, a
  Conversation with no reply, and a reply whose Mini-Me has not been chosen yet.

A paused reply's status SHALL be read from what the core stores for it, so it is still given
after the app restarts. Computing the status SHALL NOT change any Project file.

#### Scenario: A running reply
- **WHEN** Researcher's reply in "Literature" is running *Find Papers*
- **THEN** the list gives "Literature" the status `running` with Researcher

#### Scenario: A reply paused at an approval
- **WHEN** Investigator's reply in "Trial design" pauses at its approval
- **THEN** the list gives "Trial design" the status `needs_approval` with Investigator

#### Scenario: Still paused after a restart
- **WHEN** the app is restarted while a reply waits for an approval
- **THEN** the list still gives that Conversation the status `needs_approval`

#### Scenario: A reply that ended
- **WHEN** the latest reply of a Conversation completed, failed or was cancelled
- **THEN** the list gives that Conversation no status

### Requirement: The sidebar shows each Conversation's status
While a Project is open, the sidebar's Conversation list SHALL show a Conversation's status
under its title in place of its last-activity time: the avatar of the status's Mini-Me, then
"Running" or "Needs your approval", in that Mini-Me's colours. A Conversation with no status
SHALL show its last-activity time. A Mini-Me the library no longer holds SHALL be shown with a
neutral avatar. The list SHALL be reloaded each time the running replies change, so a status
appears, changes and clears as the reply runs, pauses, resumes and ends. No Step number, failed
or stopped state, or unread count SHALL be shown.

#### Scenario: A reply starts
- **WHEN** the user sends a message and Researcher's run starts
- **THEN** the Conversation's row shows Researcher's avatar and "Running" in place of the time

#### Scenario: A reply pauses and is approved
- **WHEN** Investigator's reply pauses at its approval, and later the user approves it
- **THEN** the row shows "Needs your approval" with Investigator's avatar while it waits, and
  "Running" again once the run resumes

#### Scenario: A reply finishes
- **WHEN** a running reply completes
- **THEN** the row shows the Conversation's last-activity time again

#### Scenario: Knowing who works without opening
- **WHEN** two Conversations have running replies from different Mini-Mes
- **THEN** each row shows its own Mini-Me's avatar, so the user can tell them apart without
  opening either
