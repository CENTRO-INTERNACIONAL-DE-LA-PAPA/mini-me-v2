# Spec Delta

## Purpose

Lets a researcher find datasets in CIP's Dataverse from a Conversation and download their files
into the Project, without leaving Mini-Me.

## ADDED Requirements

### Requirement: Search CIP Dataverse Trait
*Search CIP Dataverse* SHALL run on the `cip-dataverse` adapter with the show-datasets tool. It
SHALL ask the AI model chosen in Settings for a search, `{ query, from_year, to_year }`, from the
message, then search CIP Dataverse's datasets through the core and show the first page of results
as a `dataset-results` component, with one line saying how many datasets matched. Like the data
Traits, it SHALL need a model chosen in Settings.

#### Scenario: A search
- **WHEN** the user sends "@CIP's Archivist late blight datasets from Peru since 2020"
- **THEN** the reply says how many datasets matched and shows them in a results card

#### Scenario: Nothing found
- **WHEN** no dataset matches
- **THEN** the reply says no datasets were found and suggests other keywords, with no component

### Requirement: The core makes every Dataverse request
Every request to CIP Dataverse (`https://data.cipotato.org`) SHALL be made by the Rust core. During
a call, the sidecar SHALL send `core.request` method `dataverse.search`, params `{ query,
from_year, to_year, start }`; the core SHALL answer `{ total, datasets }`, at most 20 datasets from
`start`, each `{ id, title, authors, year, url, description, files }`. A failed request SHALL be
answered with `dataverse_unavailable` and a message saying Dataverse could not be reached.

#### Scenario: Dataverse is down
- **WHEN** the search request fails
- **THEN** the reply fails saying CIP Dataverse could not be reached, and to try again later

### Requirement: Dataset results component
A `dataset-results` component (version 1) SHALL list its datasets, each with its title, its
authors and year, a link to its DOI, its description shortened to three lines, and its number of
files. Below them, while more datasets match, a Show more button SHALL load the next 20 through
the core. Pages loaded this way SHALL NOT be saved; reopening the Conversation shows the first page.

#### Scenario: More than one page
- **WHEN** a search matches 213 datasets
- **THEN** the card shows 20, and Show more loads the next 20 below them

### Requirement: A dataset's files
Opening a dataset in the card SHALL list its files from its latest version, through the core: each
with its name, its type, its size, and a lock icon for a file that needs access. Each file SHALL
have a checkbox; a file already in the Project SHALL show "In Files" instead.

#### Scenario: Opening a dataset
- **WHEN** the user opens "Integrated management of late blight data"
- **THEN** the card lists its three files with their sizes and a checkbox each

### Requirement: Downloading files into the Project
A Download button SHALL download the ticked files, through the core, into the Project's Files,
in their original format, with no size limit. Each file SHALL be added to the Project's assets
folder only; Project-folder confinement holds as for imported files. Each finished file SHALL show
"In Files" with a chip that opens it. A file that fails SHALL say why and leave the others
downloaded.

#### Scenario: Downloading two files
- **WHEN** the user ticks two files and clicks Download
- **THEN** both appear in Files and the card shows them as "In Files"

#### Scenario: A restricted file without access
- **WHEN** the user downloads a restricted file with no CIP Dataverse token saved
- **THEN** that file says "Needs access: add your CIP Dataverse token in Settings" and nothing
  is saved for it

### Requirement: The CIP Dataverse token
When a CIP Dataverse token is saved, the core SHALL send it as `X-Dataverse-key` with every
request to CIP Dataverse, and SHALL NOT send it to the sidecar, write it to the Project or log it.
Without a token, requests SHALL be sent without one.

#### Scenario: A restricted file with access
- **WHEN** a token with access is saved and the user downloads a restricted file
- **THEN** the file is downloaded into Files
