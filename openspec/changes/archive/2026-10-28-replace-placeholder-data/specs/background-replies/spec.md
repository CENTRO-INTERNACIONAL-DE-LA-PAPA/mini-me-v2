# Spec Delta

## Purpose

Lets the user see which Mini-Me replies are running, in the open Conversation and in any
other Conversation or Project, so they know something is running, and go to it.

## ADDED Requirements

### Requirement: The core reports running replies
The Rust core SHALL report every reply whose Mini-Me run is in flight, in any Project: from
the moment its run starts or resumes until it completes, fails, is cancelled or pauses at an
approval. Each entry SHALL give the Project's ID and name, the Conversation's ID and title,
the reply's message ID, the Mini-Me's ID and name, and the name of the Step it last started,
or none before its first Step.

#### Scenario: A reply running in another Project
- **WHEN** Researcher's reply in "Literature" of "Late blight resistance" is running
  *Find Papers*
- **THEN** the report has that reply with Researcher, "Literature", "Late blight resistance"
  and the Step "Find Papers"

#### Scenario: A paused reply
- **WHEN** Investigator's reply pauses at its approval
- **THEN** it leaves the report until the approval is approved and the run resumes

#### Scenario: Choosing a Mini-Me
- **WHEN** a message is sent and Jev is still choosing which Mini-Me answers
- **THEN** nothing is reported for it until the chosen Mini-Me's run starts

### Requirement: The UI follows running replies
The UI SHALL get the current running replies and SHALL be sent the whole updated list each
time a reply starts, resumes, starts a Step, or stops running. This uses no protocol event
and persists nothing.

#### Scenario: Step change
- **WHEN** Investigator's running reply moves from *Scout* to *Wonder*
- **THEN** the UI receives the list with that reply's Step "Wonder"

#### Scenario: Reply finishes
- **WHEN** a running reply completes
- **THEN** the UI receives the list without it

### Requirement: The Jobs panel
A Conversation SHALL offer a Jobs panel listing every running reply, in any Project, each
with its Mini-Me's avatar and colour, the Mini-Me's name and the current Step. The open
Conversation's reply SHALL come first, marked as in this Conversation; every other SHALL show
its Conversation's title and Project's name. The panel's button SHALL show how many there
are. With none, the panel SHALL say that nothing is running.

#### Scenario: Replies here and elsewhere
- **WHEN** a reply runs in the open Conversation and another in "Literature"
- **THEN** the Jobs panel lists the open Conversation's reply first, then the one in
  "Literature", and its button shows 2

#### Scenario: Nothing running
- **WHEN** no reply is running in any Project
- **THEN** the panel says nothing is running, and its button shows no count

### Requirement: Opening a running reply
Clicking an entry in the Jobs panel SHALL show the reply: in the open Conversation, by
scrolling to it; otherwise by opening its Conversation scrolled to the reply, opening its
Project first when it belongs to another one.

#### Scenario: Reply in the open Conversation
- **WHEN** the user clicks the open Conversation's running reply
- **THEN** the Conversation scrolls to that reply without reloading

#### Scenario: Reply in another Project
- **WHEN** the user clicks Researcher's reply from "Late blight resistance" while another
  Project is open
- **THEN** "Late blight resistance" is opened and "Literature" is shown at Researcher's reply
