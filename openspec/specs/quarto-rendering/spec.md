# quarto-rendering Specification

## Purpose
Finds the Quarto install that the user has on their machine, checks that it is version 1.10 or later,
and renders Quarto documents with it for the document view's preview and PDF export. Quarto is an
optional add-on: without a usable install, document work is blocked and the rest of the app is
unchanged.

## Requirements

### Requirement: Finding Quarto
The Rust core SHALL look for Quarto in this order: the path the user set in Settings, then the
`quarto` command on the system's PATH, then the usual install folders of the user's operating
system. It SHALL report the first Quarto it finds, or that none was found. It SHALL look when the app
starts, when the user asks it to look again, and when the user changes the location in Settings, and
SHALL use that result for document work in between.

#### Scenario: Quarto on the PATH
- **WHEN** no path is set in Settings and `quarto` is on the PATH
- **THEN** the core uses that Quarto

#### Scenario: Path set in Settings
- **WHEN** the user has set a path in Settings to a Quarto program
- **THEN** the core uses that program, even when another Quarto is on the PATH

#### Scenario: Not installed
- **WHEN** no Quarto is found
- **THEN** the core reports that Quarto is missing, and document work is blocked

#### Scenario: Installed after the app started
- **WHEN** Quarto is installed while the app runs and the user clicks Check again
- **THEN** the core finds it and document work becomes available

#### Scenario: Removed after the app started
- **WHEN** Quarto is moved or removed while the app runs and a render cannot start it
- **THEN** the render fails saying Quarto could not be started, and the core looks again, so document
  work is blocked from then on

### Requirement: Quarto version
The core SHALL use a Quarto only when its version is 1.10 or later, and SHALL report a Quarto
older than that as too old, with its version.

#### Scenario: Too old
- **WHEN** the Quarto found reports version 1.9.9
- **THEN** the core reports it as too old and document work is blocked

#### Scenario: Supported
- **WHEN** the Quarto found reports version 1.10.18
- **THEN** the core uses it

### Requirement: Quarto in Settings
Settings SHALL show whether Quarto was found, its version and its location, and SHALL let the user
set the location of the Quarto program or clear it, and SHALL have a Check again button. Changing the
setting or clicking Check again SHALL make the core look for Quarto again at once.

#### Scenario: Setting the location
- **WHEN** the user sets the location to a Quarto program
- **THEN** Settings shows that program's version and location

#### Scenario: Clearing the location
- **WHEN** the user clears the location
- **THEN** the core looks for Quarto again as described in "Finding Quarto"

#### Scenario: Checking again
- **WHEN** the user clicks Check again after installing Quarto
- **THEN** Settings shows the Quarto found, with its version and location

### Requirement: Rendering a document
The core SHALL render a document by copying its source into a new temporary folder, running Quarto
there to render the document to Typst and then to PDF, and reading the result. For the preview, the
core SHALL convert the PDF's pages to one SVG image per page. The temporary folder SHALL be removed
after the render, whether it succeeded or not.

#### Scenario: Render for export
- **WHEN** the user exports a document
- **THEN** the core renders it with Quarto and stores the PDF as an Asset of the Project

#### Scenario: Render for preview
- **WHEN** the user clicks Render
- **THEN** the core renders the document with Quarto and the preview shows its pages

#### Scenario: Folder removed
- **WHEN** a render finishes or fails
- **THEN** its temporary folder no longer exists

### Requirement: Project files in a render
Before rendering, the core SHALL copy into the temporary folder each Project file whose name appears
in the document's source, under that name. A file the document does not name SHALL NOT be copied.

#### Scenario: A figure
- **WHEN** the source contains `![Trial sites](sites.png)` and the Project holds `sites.png`
- **THEN** the render includes the figure

#### Scenario: Other files
- **WHEN** the Project holds `field-trial.csv` and the source does not name it
- **THEN** the file is not copied into the temporary folder

### Requirement: Rendering confinement
A render SHALL run Quarto with code execution turned off, so no code cell runs. Quarto SHALL run only
in the render's temporary folder, and a render that runs longer than a fixed time limit SHALL be
stopped and report that the document took too long to render.

#### Scenario: A Python cell
- **WHEN** the document holds a ```` ```{python} ```` cell and is rendered
- **THEN** the cell's code is shown and no code runs

#### Scenario: Too slow
- **WHEN** a render runs past the time limit
- **THEN** Quarto is stopped and the view says the document took too long to render

### Requirement: Render errors
When Quarto fails, the render SHALL report Quarto's error message for the document. The preview
SHALL keep its last good pages, and an export SHALL save nothing.

#### Scenario: A broken chunk
- **WHEN** the document has a YAML header that Quarto cannot read
- **THEN** the view shows Quarto's message, and the preview keeps its last pages
