# home Specification

## Purpose
Defines Home, the view shown when no Project is open: how it greets the user and how it
gathers the replies across Projects that wait on the user's approval.

## Requirements

### Requirement: Greeting
Home SHALL greet the user with "Good morning" before 12:00, "Good afternoon" from 12:00 to
17:59 and "Good evening" from 18:00, in local time, followed by ", <first name>" when the
user has a name.

#### Scenario: Named user in the afternoon
- **WHEN** the saved name is "Ana Pérez" and Home is shown at 14:30
- **THEN** it reads "Good afternoon, Ana"

#### Scenario: No name
- **WHEN** the user has no name and Home is shown at 09:00
- **THEN** it reads "Good morning"

### Requirement: Listing paused approvals across Projects
The Rust core SHALL list every reply paused at an approval in every Project of the Project
list, newest pause first. Each entry SHALL give the Project's ID and name, the Conversation's
ID and title, the reply's message ID, the Mini-Me's ID and name, and the approval's prompt.
Listing SHALL only read each `project.sqlite` and SHALL NOT change any Project file.

#### Scenario: Two Projects waiting
- **WHEN** Investigator paused in "Late blight resistance" yesterday and Planner paused in
  "Seed potato virus survey" today
- **THEN** the list has Planner's approval first, then Investigator's, each with its Project
  and Conversation

#### Scenario: Answered approval
- **WHEN** an approval has been approved or rejected, or its reply was stopped
- **THEN** it is no longer listed

### Requirement: Unreadable Projects are skipped
A Project whose `project.sqlite` cannot be read, or whose schema is newer than the app
supports, SHALL be left out of the list without failing it, and its files SHALL be unchanged.

#### Scenario: Project from a newer app version
- **WHEN** one Project's database is newer than the app supports and another has a paused
  approval
- **THEN** the other Project's approval is listed, and the newer database is not modified

### Requirement: Waiting on you
Home SHALL show a "Waiting on you" section listing the paused approvals, each in its
Mini-Me's colour with its avatar, the approval's prompt, and the Mini-Me's, Project's and
Conversation's names. The list SHALL be fetched each time Home is shown. With none, the
section SHALL say that nothing is waiting on the user.

#### Scenario: One approval waiting
- **WHEN** Investigator's reply in "Trial design" of "Late blight resistance" is paused
- **THEN** Home lists "Design an experiment to test this plan's hypothesis?" with
  Investigator, "Late blight resistance" and "Trial design"

#### Scenario: Nothing waiting
- **WHEN** no reply is paused in any Project
- **THEN** the section says nothing is waiting on the user

### Requirement: Opening an approval from Home
Each entry SHALL have a Review button that opens its Project and its Conversation scrolled
to the paused reply, where the approval is answered as in the Conversation. If the Project
cannot be opened, Home SHALL show why and stay open.

#### Scenario: Review
- **WHEN** the user clicks Review on Investigator's approval
- **THEN** "Late blight resistance" is opened and "Trial design" is shown scrolled to the
  paused reply with Approve and Reject

#### Scenario: Back on Home after answering
- **WHEN** the user approves it and returns to Home
- **THEN** that approval is no longer listed
