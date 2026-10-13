# projects Specification

## Purpose

Defines where Mini-Me keeps the user's data on disk, how Projects are created, listed and
opened, how the installation and user are identified, and the rule that keeps every
operation inside its Project folder.

## Requirements

### Requirement: Mini-Me Data folder
On first launch the app SHALL create a folder named `Mini-Me Data` in the user's Documents
folder, and SHALL use it as the root for all Projects. If the folder already exists, its
contents SHALL be kept.

#### Scenario: First launch
- **WHEN** the app starts and no `Mini-Me Data` folder exists in the Documents folder
- **THEN** the folder is created and the Project list is empty

#### Scenario: Existing data is preserved
- **WHEN** the app starts and the `Mini-Me Data` folder already contains Projects
- **THEN** those Projects are listed and none of their files are changed

### Requirement: Installation and user identity
On first launch the app SHALL generate an installation ID and a local user ID (both UUIDs)
and store them in the app's settings, outside the Mini-Me Data folder. Both IDs SHALL stay
the same across restarts.

#### Scenario: IDs are stable
- **WHEN** the app is restarted
- **THEN** it uses the same installation ID and user ID as before

### Requirement: Create a Project
The user SHALL be able to create a Project by giving it a name of 1 to 100 characters after
trimming whitespace. Creating a Project SHALL create a Project folder inside Mini-Me Data
containing `project.sqlite` and an empty `assets` folder, and SHALL record the Project's ID,
name and creation time in `project.sqlite`.

#### Scenario: Successful creation
- **WHEN** the user creates a Project named "Late Blight Resistance"
- **THEN** a Project folder exists in Mini-Me Data with `project.sqlite` and `assets/`
- **AND** the Project appears in the Project list with that name

#### Scenario: Invalid name
- **WHEN** the user tries to create a Project with an empty or whitespace-only name, or a
  name longer than 100 characters
- **THEN** no folder is created and the user sees why the name was rejected

### Requirement: Project folder names
The Project folder name SHALL be derived from the Project name, with characters that are not
valid in file names on Windows, macOS or Linux replaced. If a folder with that name already
exists, a numeric suffix SHALL be added so the new Project never reuses another Project's
folder.

#### Scenario: Unsafe characters
- **WHEN** the user creates a Project named `Trials: 2026/27`
- **THEN** the folder name contains no `:` or `/` characters

#### Scenario: Name collision
- **WHEN** the user creates two Projects with the same name
- **THEN** each gets its own folder and both appear in the Project list

### Requirement: List Projects
The Project list SHALL show every folder directly inside Mini-Me Data that contains a valid
`project.sqlite`, with its name, ordered by most recently opened first. Folders without a
valid `project.sqlite` SHALL be ignored and left untouched.

#### Scenario: Unrelated folders are ignored
- **WHEN** the user has put an unrelated folder inside Mini-Me Data
- **THEN** it does not appear in the Project list and is not modified

### Requirement: Open a Project
The user SHALL be able to open a Project from the list to see its Conversations. If the
Project's database was created by a newer version of the app, the app SHALL refuse to open
it and tell the user to update, without modifying it. If it was created by an older version,
the app SHALL upgrade it in place before opening.

#### Scenario: Open an existing Project
- **WHEN** the user opens a Project
- **THEN** its Conversations are listed

#### Scenario: Database from a newer app version
- **WHEN** the user opens a Project whose database schema is newer than the app supports
- **THEN** the Project is not opened, its files are unchanged and the user is told to update
  Mini-Me

### Requirement: Project-folder confinement
Every file the app reads or writes on behalf of a Project SHALL resolve to a path inside that
Project's folder. Paths that would leave the folder, including through `..` segments,
absolute paths or symbolic links, SHALL be rejected. The only exception is reading a file the
user explicitly picked in a file dialog in order to import it.

#### Scenario: Path traversal is rejected
- **WHEN** any operation asks for a Project file path containing `..` that resolves outside
  the Project folder
- **THEN** the operation fails with a confinement error and nothing is read or written

#### Scenario: Symbolic link escaping the folder
- **WHEN** a path inside the Project folder is a symbolic link pointing outside it
- **THEN** reading or writing through it fails with a confinement error
