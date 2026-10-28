## MODIFIED Requirements

### Requirement: Import a file as an Asset
The user SHALL be able to attach files from their computer to a message: by picking them, by
pasting an image into the composer, or by dropping files on the open Conversation. The app
SHALL copy each file into the Project's `assets` folder and register it as an `upload` Asset.
The original file SHALL NOT be modified or moved. Picked and dropped files SHALL come only
from the operating system's file picker or drop, never from a path the UI names: the core
SHALL import a dropped file only when its path is one the operating system reported for the
latest drop on the window. A pasted image SHALL be stored from its bytes, named after its
file name when the clipboard gives one and otherwise `Pasted image` with the extension of its
media type. Folders SHALL NOT be imported.

#### Scenario: Attach a file
- **WHEN** the user attaches `field-trial.csv` while writing a message
- **THEN** a copy is stored inside the Project's `assets` folder, an Asset is registered,
  and the file shows as an attachment in the composer
- **AND** the original `field-trial.csv` is unchanged

#### Scenario: Same file name twice
- **WHEN** the user imports two different files both named `data.csv`
- **THEN** both are stored without overwriting each other and each has its own Asset ID

#### Scenario: Pasting a screenshot
- **WHEN** the user copies a screenshot and pastes it into the composer
- **THEN** it is stored as `Pasted image.png` in the Project's `assets` folder and shows as
  an attachment in the composer

#### Scenario: Pasting text
- **WHEN** the user pastes text with no image on the clipboard
- **THEN** the text is inserted and nothing is attached

#### Scenario: Dropping files
- **WHEN** the user drops `plots.csv` and `field.jpg` on the open Conversation
- **THEN** both are imported and show as attachments in the composer

#### Scenario: A path that was not dropped
- **WHEN** the UI asks the core to import a path that was not part of the latest drop
- **THEN** the request is refused and nothing is imported

## ADDED Requirements

### Requirement: Attachments in the composer
Files attached to a message being written SHALL show in a row at the top of the composer,
above the text, each with a button that removes it from the message. An image the webviews
can draw on every platform (PNG, JPEG, GIF or WebP) SHALL show as a small thumbnail with its
name; any other file SHALL show its name and size. While files are dragged over the open
Conversation, it SHALL show that dropping them attaches them.

#### Scenario: Image attachment
- **WHEN** the user attaches `field.jpg`
- **THEN** the composer shows a thumbnail of the photo with the name `field.jpg` above the
  text

#### Scenario: Other attachment
- **WHEN** the user attaches `field-trial.csv`
- **THEN** the composer shows `field-trial.csv` and its size above the text

#### Scenario: Removing an attachment
- **WHEN** the user removes `field.jpg` from the row
- **THEN** it is no longer attached, and the message is sent without it

### Requirement: Reading an image Asset for its thumbnail
The UI SHALL be able to read the bytes of a PNG, JPEG, GIF or WebP Asset of the open Project
from the Rust core, to draw its thumbnail. The core SHALL resolve the Asset ID to its file
through the Project-folder confinement rule and refuse any other media type.

#### Scenario: Reading an image
- **WHEN** the UI asks for the bytes of the Asset `field.jpg`
- **THEN** it gets the file's bytes with media type `image/jpeg`

#### Scenario: Not an image
- **WHEN** the UI asks for the bytes of the Asset `field-trial.csv`
- **THEN** the request is refused
