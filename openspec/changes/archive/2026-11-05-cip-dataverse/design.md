# Design

## Context

Built-in Traits and Mini-Mes are data in `src-tauri/library/builtin.json`; *Explore Dataverse*
(`…7a12`) is a placeholder on the `echo` adapter. Sidecar adapters live in
`sidecar/src/mini_me_sidecar/adapters/` and show components through one show tool per kind. The
core checks only generic limits on a component (2 MiB of data, non-empty text). The core already
makes blocking HTTP calls with `reqwest` off the async runtime in `ai2.rs`, keeps keys in the
keychain (`secrets.rs`), and stores files into a Project through `assets.rs`, whose `import` has
no size limit. CIP Dataverse's API is public: `GET /api/search`,
`GET /api/datasets/:persistentId/versions/:latest/files` and `GET /api/access/datafile/{id}`.

## Goals / Non-Goals

**Goals:**
- One Dataverse client, in the core, used by the Trait, the card and downloads alike.
- The token never leaves the core.

**Non-Goals:**
- Other Dataverse servers: the base URL is a constant.
- Caching search results or file lists.

## Decisions

### All Dataverse HTTP in the core (`dataverse.rs`)
`search(query, from_year, to_year, start)`, `files(dataset_id)` and `download(file_id, to)` use a
blocking `reqwest` client with a 30-second timeout for search and listing and none for
downloads, on a plain thread as `ai2.rs` does. Search sends `q`, `type=dataset`, `start`,
`per_page=20`, and `fq=dateSort:[<from>-01-01T00:00:00Z TO <to>-12-31T23:59:59Z]` when years are
given. A dataset is read from a result's `global_id`, `name`, `authors`, `published_at`, `url`,
`description` and `fileCount`; a file from `dataFile.id`, `filename` (or `originalFileName`
when Dataverse ingested a tabular file), `contentType`, `filesize` and `restricted`. A saved
`dataverse` token is read from the keychain for each request and sent as `X-Dataverse-key`.

*Alternative:* the sidecar's `httpx`, as the old MCP did. Rejected: Show more, file lists and
downloads happen after the reply ends, when no Trait call exists, and the token would have to
reach the sidecar.

### The Trait reaches Dataverse through a core request
The `cip-dataverse` adapter declares the AI providers, asks the model for `{ query, from_year,
to_year }` with the same structured-output helper the data Traits use, then sends `core.request`
`dataverse.search` with `start: 0`. It writes one line ("Found 213 datasets."), and adds a
`dataset-results` component `{ query, from_year, to_year, total, datasets }` through
`show_datasets`. If the component is refused, it lists up to 20 datasets as text.

### The card talks to the core directly
`dataset-results` version 1 (`src/components/interactive/dataset-results.tsx`) renders the saved
first page and calls new IPC commands:
- `dataverse_search(query, from_year, to_year, start)` for Show more;
- `dataverse_files(project_id, dataset_id)`, which also marks files already in the Project;
- `dataverse_download(project_id, dataset, files)`, which downloads each ticked file and returns
  each one's Asset or error.

Show more pages and opened file lists live in the card's React state only, as chart controls do.

### Where a downloaded file came from
A download is streamed to a temporary file in the OS temp folder, then stored with the existing
`import` path into `assets/<id>/<name>`, so confinement and naming work as for an upload. The
`assets` table gains `origin TEXT` (JSON `{ kind: "dataverse", file_id, dataset_id, title, url }`)
and `source` takes the value `dataverse`; `added_by` is the user. `FileEntry` carries `origin`, so
Files shows "From Dataverse", which opens `url`, and `dataverse_files` matches
`file_id` to show "In Files".

### The token as a key account
`secrets.rs` adds `dataverse` ("CIP Dataverse") to the key accounts. `Runs::secret` refuses it to
every call, whatever the adapter declares. Settings → Accounts gets a CIP Dataverse section with
the existing key row.

### CIP's Archivist
A new predefined Mini-Me in the Data group, id `…7b17`, avatar base `peruanita`, face `content`,
accessory `crown`, in ochre (tint `#FDE7CF`, solid `#C17A00`, ink `#784900`, hue 70°), the middle
of the gap between Skeptic's brown (55°) and Theorist's yellow (84°); its ink is 7.29:1 on its wash
and 6.36:1 on its tint. *Explore Dataverse* keeps `…7a12` and becomes
*Search CIP Dataverse* with adapter `cip-dataverse`, tool `show_datasets`, and instructions for
writing the search.

## Risks / Trade-offs

- [Dataverse's search syntax and field names change] → Parsing lives in one module with unit
  tests on recorded responses.
- [A very large file] → Streamed to disk, never held in memory; the card shows progress per file.
- [Ingested tabular files differ from the original] → Downloads ask for `format=original` and
  use `originalFileName`.

## Migration Plan

`project.sqlite` moves up one version: `ALTER TABLE assets ADD COLUMN origin TEXT`. Projects
migrate when opened; existing Assets have no origin.
