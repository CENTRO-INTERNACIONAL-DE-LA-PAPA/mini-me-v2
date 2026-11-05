# Tasks

## 1. Dataverse client in the core

- [x] 1.1 Add `src-tauri/src/dataverse.rs` with `search`, `files` and `download` (streamed to a file), the year filter, the token header, and parsing of results and files; verify with unit tests on recorded responses for a search, a file list with an ingested tabular file, and a failed request mapped to `dataverse_unavailable`
- [x] 1.2 Add the `dataverse` key account in `secrets.rs` and refuse it to every Trait call in `Runs::secret`; verify with a unit test that a call declaring `dataverse` gets `secret_not_allowed`

## 2. Files from Dataverse

- [x] 2.1 Add the `origin` column in a `db.rs` migration, the `dataverse` source and `origin` in `assets.rs` and `FileEntry`, and storing a downloaded file through `import`; verify with unit tests that a migrated database keeps its Assets and that a stored download lists with its origin
- [x] 2.2 Add `dataverse_search`, `dataverse_files` (marking files already in the Project) and `dataverse_download` to `ipc.rs` and `lib.rs`, and answer `core.request` `dataverse.search` in `runs.rs`; verify `cd src-tauri && cargo test` passes, with a `runs.rs` test of the core request

## 3. The Trait and its Mini-Me

- [x] 3.1 Add the `cip-dataverse` adapter and the `show_datasets` tool in the sidecar, with the model writing the search and the text fallback for a refused component; verify `cd sidecar && uv run pytest` passes, with a test of turning the model's answer into search params
- [x] 3.2 Build *Explore Dataverse* as *Search CIP Dataverse* and add CIP's Archivist in `src-tauri/library/builtin.json`, and the `show_datasets` tool in `library.rs`; update the library tests (names, tools, adapters, sixteen Mini-Mes, placeholders) and `sidecar/tests/test_tool_lists.py`; verify both suites pass
- [x] 3.3 Check CIP's Archivist's colours against the others (ink ≥4.5:1 on its wash and tint, no shared colour); verify by listing the contrast ratios for the user

## 4. UI

- [x] 4.1 Add the `dataverse` API calls, the `dataset-results` types and `FileEntry.origin` in `src/api.ts` and `src/protocol/types.ts`, and register the renderer in `catalogue.ts`; verify `npm test` (with `catalogue.test.ts`'s show-tool mapping) and `npx tsc --noEmit` pass
- [x] 4.2 Build the `dataset-results` card: datasets, Show more, opening a dataset's files with checkboxes, a lock icon for restricted files, "In Files" with a chip, Download and per-file errors, styled to DESIGN.md; verify in the app with "@CIP's Archivist late blight datasets"
- [x] 4.3 Show "From Dataverse" in Files' Added by opening the dataset, and add the CIP Dataverse card to Settings → Accounts; verify in the app by downloading a file and saving and removing a token

## 5. Docs

- [x] 5.1 Describe CIP's Archivist and downloading from Dataverse in `docs/using.md`, and replace the *Explore Dataverse* row in `README.md`; verify the text matches the app
