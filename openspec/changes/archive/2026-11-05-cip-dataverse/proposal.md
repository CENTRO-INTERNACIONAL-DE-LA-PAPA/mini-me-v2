# Proposal

## Why

CIP's research data lives in its Dataverse (`data.cipotato.org`), and bringing a dataset into a
Project today means finding it on the website, downloading by hand and importing. Issue #91 asks
for finding datasets and downloading their files into a Project from Mini-Me.

## What Changes

- The placeholder Trait *Explore Dataverse* is built as **Search CIP Dataverse**, keeping its ID.
  It runs on a new `cip-dataverse` adapter, and a new predefined Mini-Me, **CIP's Archivist**,
  runs it.
- The AI model turns the user's message into a Dataverse search (keywords and an optional range
  of years). Like the data Traits, it needs a model chosen in Settings.
- The results show in a new **dataset results** Interactive Component: each dataset with its
  title, authors, year, a link to its DOI and its description, 20 at a time with Show more.
  Opening a dataset lists its files (name, type, size, and whether access is restricted).
- The user ticks files and clicks Download; the Rust core downloads them straight into the
  Project's Files. No AI model is involved, and no size limit applies.
- Downloaded files show "From Dataverse" in Files, which opens their dataset.
- Settings → Accounts gets a **CIP Dataverse** card for an API token, kept in the OS keychain
  and sent only by the core, for restricted datasets. Public data needs none.
- Every request to Dataverse is made by the Rust core: the first search for the Trait, further
  pages, file lists and downloads. There is no MCP server; the previous app's one wrapped the
  same three API calls.
- Out of scope: uploading to Dataverse, keeping downloaded files in sync, the model downloading
  files itself, and Dataverse servers other than CIP's.

**New external service and credential:** CIP Dataverse's public API, over the network, and an
optional Dataverse API token. Searching and downloading cost nothing extra; turning the message
into a search is one small call to the user's AI model.

## Capabilities

### New Capabilities

- `dataverse`: searching CIP Dataverse, the Search CIP Dataverse Trait, the dataset results
  component and downloading files into a Project, and the CIP Dataverse token.

### Modified Capabilities

- `mini-mes`: sixteen predefined Mini-Mes with CIP's Archivist in the Data group, and
  *Explore Dataverse* no longer a placeholder.
- `interactive-components`: the `dataset-results` kind.
- `credentials`: the CIP Dataverse token in the keychain and in Settings.
- `assets`: files downloaded from Dataverse, and "From Dataverse" in Files.
- `project-overview`: a dataset results card shows on the Overview as "213 datasets".

## Impact

- Rust core: a new `dataverse.rs` (HTTP with `reqwest`, already a dependency), new IPC commands,
  a `dataverse.search` core request, `secrets.rs` (the `dataverse` key account), `assets.rs` and
  `db.rs` (a migration for a file's origin), and `library/builtin.json`.
- Sidecar: a new `cip-dataverse` adapter and a `show_datasets` tool.
- UI: a `dataset-results` renderer, the Accounts card, and Files' "Added by".
- The `project.sqlite` schema moves up one version; existing Projects migrate when opened.
