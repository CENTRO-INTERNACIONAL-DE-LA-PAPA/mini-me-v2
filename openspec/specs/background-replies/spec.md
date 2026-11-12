# background-replies Specification

## Purpose
Lets the user see which Mini-Me replies are running, in the open Conversation and in any
other Conversation or Project, so they know something is running, and go to it.

## Requirements

### Requirement: The core reports running replies
The Rust core SHALL report every reply whose Mini-Me run is in flight, in any Project: from
the moment its run starts or resumes until it completes, fails, is cancelled or pauses at an
approval. Each entry SHALL give the Project's ID, the Conversation's ID and title, the reply's
message ID, and the Mini-Me's ID and name.

#### Scenario: A reply running in another Project
- **WHEN** Researcher's reply in "Literature" of "Late blight resistance" is running
- **THEN** the report has that reply with Researcher, "Literature" and the Project's ID

#### Scenario: A paused reply
- **WHEN** Investigator's reply pauses at its approval
- **THEN** it leaves the report until the approval is approved and the run resumes

#### Scenario: Choosing a Mini-Me
- **WHEN** a message is sent and Jev is still choosing which Mini-Me answers
- **THEN** nothing is reported for it until the chosen Mini-Me's run starts

### Requirement: Notifying when a reply ends out of view
When a reply leaves the running replies because it completed, failed or paused at an approval,
and the window is not focused or its Conversation is not the open one, the app SHALL send a
desktop notification titled with the Conversation's title, saying which Mini-Me and what
happened ("Theorist replied", "Theorist's reply failed", "Theorist needs your approval"). A
cancelled reply SHALL NOT notify. When the Conversation was not the open one, the sidebar SHALL
mark it with a dot until it is opened; the marks are not kept across restarts.

#### Scenario: Theorist finishes in another Conversation
- **WHEN** Theorist's reply in "Literature" completes while the user is in "Trial design"
- **THEN** a notification titled "Literature" says "Theorist replied", and
  "Literature" has a dot in the sidebar until the user opens it

#### Scenario: Watching the reply
- **WHEN** the reply completes in the open Conversation while the window is focused
- **THEN** no notification is sent and no dot is shown

### Requirement: The UI is sent the running replies
The UI SHALL get the current running replies and SHALL be sent the whole updated list each
time a reply starts, resumes, or stops running. This uses no protocol event and persists
nothing.

#### Scenario: Reply finishes
- **WHEN** a running reply completes
- **THEN** the UI receives the list without it
