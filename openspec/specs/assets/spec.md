# assets Specification

## Purpose

Defines the per-Project registry of files (Assets): how files enter a Project, how they are
identified and attached to messages, and how the user opens them.

## Requirements

### Requirement: Asset registry
Each Project SHALL keep a registry of its Assets in `project.sqlite`. Each Asset SHALL have an
`id` (UUIDv7), a `name` (original file name), a `media_type`, a `size_bytes`, a `source`
(`upload` or `generated`) and a creation time. Assets SHALL be addressed by ID everywhere
outside the registry.

#### Scenario: Registry entry after import
- **WHEN** a file is imported into a Project
- **THEN** the registry contains an entry with its ID, original name, media type, size,
  source `upload` and creation time

### Requirement: Import a file as an Asset
The user SHALL be able to pick a file from their computer to attach to a message. The app
SHALL copy the file into the Project's `assets` folder and register it. The original file
SHALL NOT be modified or moved.

#### Scenario: Attach a file
- **WHEN** the user attaches `field-trial.csv` while writing a message
- **THEN** a copy is stored inside the Project's `assets` folder, an Asset is registered,
  and the file shows as an attachment in the composer
- **AND** the original `field-trial.csv` is unchanged

#### Scenario: Same file name twice
- **WHEN** the user imports two different files both named `data.csv`
- **THEN** both are stored without overwriting each other and each has its own Asset ID

### Requirement: Asset files stay inside the Project
Asset files SHALL be stored only inside the Project's `assets` folder, and resolving an
Asset ID to a file SHALL follow the Project-folder confinement rule.

#### Scenario: Stored location
- **WHEN** an Asset is imported
- **THEN** its file path resolves inside `<Project folder>/assets`

### Requirement: Attachments on messages
A message's attachments SHALL be Asset IDs from the same Project. `attachment.added` with
payload `{ message_id, asset: { id, name, media_type, size_bytes } }` SHALL add an Asset to an
existing message. A message referencing an Asset ID that does not exist in the Project SHALL
be rejected.

#### Scenario: Attachment shown on a sent message
- **WHEN** the user sends a message with an attached Asset
- **THEN** the message shows the attachment with its name and size

#### Scenario: Attachment added to an existing reply
- **WHEN** an `attachment.added` event arrives for a reply message
- **THEN** the attachment appears on that same message rather than in a new message

#### Scenario: Unknown Asset ID
- **WHEN** a message is sent with an attachment ID that is not in the Project's registry
- **THEN** the message is rejected and nothing is persisted

### Requirement: Open an Asset
The user SHALL be able to open an attached Asset with the operating system's default
application for its type.

#### Scenario: Open an attachment
- **WHEN** the user clicks an attachment on a message
- **THEN** the file stored in the Project opens in the system's default application

### Requirement: List Assets for references
The app SHALL provide the list of a Project's Assets, filtered by name, so the user can pick
one when typing `#` in the composer.

#### Scenario: Filter by name
- **WHEN** the user types `#trial` in the composer
- **THEN** the suggestions show the Project's Assets whose names contain "trial"

### Requirement: The Files screen lists a Project's Assets
The app SHALL show every Asset of the open Project on its Files screen, newest first, with
its name, who added it, the Conversations that use it, when it was added and its size. "Who
added it" SHALL be the author of the first message the Asset is attached to, and an Asset
SHALL count as used in a Conversation when one of its messages attaches it or references it
with `#`. The Files screen SHALL filter Assets by name and by kind (data, documents, or files a Mini-Me
saved), import files with Upload, and open an Asset when its row is clicked.

#### Scenario: A file used in two Conversations
- **WHEN** the user attaches `field-trial.csv` to a message in one Conversation and
  references it with `#field-trial.csv` in another
- **THEN** the Files screen shows `field-trial.csv` as added by You and used in 2 conversations

#### Scenario: A file a Mini-Me saved
- **WHEN** Curator saves `trial-cleaned.csv` and attaches it to its reply
- **THEN** the Files screen shows `trial-cleaned.csv` under Mini-Me outputs, added by Curator
