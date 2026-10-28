# Spec Delta

## ADDED Requirements

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
Settings SHALL have an Appearance page with a "Show Mini-Mes on Home" switch, off by default
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
