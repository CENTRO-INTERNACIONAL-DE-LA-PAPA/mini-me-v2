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

### Requirement: Mini-Me playground
Home SHALL be able to show every Mini-Me in the library, built-in and user-made, as its
avatar in a layer that fills the Home sheet behind its content and stays in place while the
content scrolls. When they appear, the Mini-Mes SHALL drop in under gravity from random
positions across the width and come to rest along the bottom of the sheet, colliding with
each other and with the sheet's edges.

#### Scenario: Opening Home
- **WHEN** "Show Mini-Mes on Home" is on, the library has the built-in Mini-Mes and one
  user-made Mini-Me, "Translator", and Home is shown
- **THEN** every one of them, Translator included, drops in and piles along the bottom of
  the Home sheet

#### Scenario: Random drop
- **WHEN** the Mini-Mes appear twice
- **THEN** they drop from different positions across the width each time, not from a
  straight line

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

### Requirement: A key sequence brings the Mini-Mes
On Home, pressing Up, Up, Down, Down, Left, Right, Left, Right in a row SHALL make the
Mini-Mes drop in, whether the setting is on or off; if they are already shown, another
batch of every Mini-Me SHALL drop in on top of them, keeping those already there. Keys
pressed while typing in a field SHALL NOT count.

#### Scenario: Setting off
- **WHEN** "Show Mini-Mes on Home" is off and the user presses the sequence on Home
- **THEN** the Mini-Mes drop in

#### Scenario: Pressed again
- **WHEN** the Mini-Mes are already piled on Home and the user presses the sequence again
- **THEN** a second batch of every Mini-Me drops onto the pile, and the first stays

#### Scenario: Typing in a field
- **WHEN** the user presses the arrow keys in the sequence while typing a Project name
- **THEN** nothing drops in

#### Scenario: Window resized
- **WHEN** the user makes the window narrower while Home is shown
- **THEN** the Mini-Mes stay inside the sheet

### Requirement: Moving Mini-Mes
The user SHALL be able to grab a Mini-Me in the playground, drag it, and release it; a
Mini-Me released while moving SHALL keep moving in that direction and fall under gravity.
Grabbing SHALL work only where no card, button or field of Home covers the Mini-Me, and
scrolling Home SHALL keep working everywhere.

#### Scenario: Throwing a Mini-Me
- **WHEN** the user drags Plotter upward quickly and lets go
- **THEN** Plotter flies on, falls back and comes to rest on the pile

#### Scenario: Content on top
- **WHEN** a Project card covers part of a Mini-Me and the user clicks the card
- **THEN** the Project opens and the Mini-Me does not move

### Requirement: Naming a Mini-Me
A click on a Mini-Me without dragging it SHALL show its name next to it. The name SHALL
follow the Mini-Me while it moves and SHALL hide after a few seconds or when the user clicks
elsewhere.

#### Scenario: Who is this
- **WHEN** the user clicks Skeptic without moving the pointer
- **THEN** "Skeptic" is shown next to it

### Requirement: Reduced motion
When the system asks for reduced motion, the Mini-Mes SHALL appear already resting along the
bottom of the sheet without dropping in. They SHALL still be draggable.

#### Scenario: Reduced motion on
- **WHEN** reduced motion is on and the Mini-Mes appear
- **THEN** the Mini-Mes are already resting along the bottom, and none animates in

### Requirement: Listing recent Conversations across Projects
The Rust core SHALL list the 5 most recently active Conversations across all Projects of the
Project list, most recent first, each with its ID and title and its Project's ID and name.
Listing SHALL only read each `project.sqlite`, skipping Projects that cannot be read or whose
schema is newer than the app's, and SHALL NOT change any Project file.

#### Scenario: Conversations in three Projects
- **WHEN** three Projects hold eight Conversations in all
- **THEN** the 5 with the latest activity are listed, newest first, each with its Project

#### Scenario: Project from a newer app version
- **WHEN** one Project's database is newer than the app supports
- **THEN** its Conversations are not listed and its files are unchanged

### Requirement: Recent conversations in Home's sidebar
With no Project open, the sidebar SHALL show a "Recent" group listing the recent
Conversations, each with its title and its Project's name, fetched each time Home is shown.
Clicking one SHALL open its Project and show that Conversation. With no Conversations, the
group SHALL be left out.

#### Scenario: Jumping back in
- **WHEN** the user clicks "Literature" from "Late blight resistance" in the Recent group
- **THEN** "Late blight resistance" is opened and "Literature" is shown

#### Scenario: No Conversations yet
- **WHEN** no Project has a Conversation
- **THEN** the sidebar shows Home and no Recent group
