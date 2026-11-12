## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: The UI is sent the running replies
The UI SHALL get the current running replies and SHALL be sent the whole updated list each
time a reply starts, resumes, or stops running. This uses no protocol event and persists
nothing.

#### Scenario: Reply finishes
- **WHEN** a running reply completes
- **THEN** the UI receives the list without it

## REMOVED Requirements

### Requirement: The UI follows running replies
**Reason**: Replaced by "The UI is sent the running replies", which no longer resends the list
when a Step starts, since no part of the UI shows a running reply's Step any more.
**Migration**: None.

### Requirement: The Jobs panel
**Reason**: The panel is no longer used; Home, the sidebar and notifications show what runs.
**Migration**: None; nothing else opens the panel.

### Requirement: Opening a running reply
**Reason**: It described clicking an entry in the removed Jobs panel.
**Migration**: A reply waiting on the user is still opened from Home's "Waiting on you".
