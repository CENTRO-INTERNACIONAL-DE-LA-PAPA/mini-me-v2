# Tasks

Tests and builds may be run by Claude on the user's Mac. Checks that need the running app are
done by the user (see CLAUDE.md).

## 1. Kinds and the Traits that list them

- [x] 1.1 Make each kind one file, `src/components/interactive/<kind>.tsx` (renderers per version and the TypeScript types of their data), with its tests in `<kind>.test.tsx`; list the kinds explicitly in `catalogue.ts`; and remove the kind folders and their `schema.json` files (D2). Verify with a frontend test that every kind a Trait in `src-tauri/library/builtin.json` lists has a renderer for version 1, and that an unknown kind or version has none
- [x] 1.2 Remove the core's schema machinery: the embedding in `src-tauri/build.rs`, `kind_schema.rs`, the validators in `components.rs` and the `jsonschema` crate (D2). Verify that `Cargo.toml` no longer lists `jsonschema` and `cargo test` passes
- [x] 1.3 Add `components` to Trait definitions and to `builtin.json`: *Find Papers* lists `paper-sources`, *Theorize* lists `theories` (D3, mini-mes spec "Trait library"). Verify with library tests that the lists load and that `builtin_library_is_consistent` passes

## 2. Storage and events

- [x] 2.1 Add migration 2 (`components` table), `Component` and `Message.components`, the `component.added` event, and its fold in the store (D4, D9). Verify with Rust tests that a migrated version-1 database keeps its messages, that replay rebuilds components in order, and that an old `message.created` without `components` parses; the fixture round-trip test covers `component.added`
- [x] 2.2 Mirror the types in `src/protocol/types.ts` and handle `component.added` in the event store. Verify with an `eventStore` test that the fixture's component lands on its message; `npm test` passes

## 3. Core requests

- [x] 3.1 Implement `component.add`: active-call and streaming checks, the call's Trait listing the kind, the 2 MiB and empty-`text` limits, persistence (specs "Adding a component to a reply", "Only listed kinds are accepted"). Verify with Rust tests for success, `component_not_allowed`, `invalid_component` for empty `text`, and `call_not_active`
- [x] 3.2 Implement `asset.write` with the shared `register` helper (D6, specs "Writing an Asset" and "Written Assets stay in the Project"). Verify with Rust tests that the file lands in `assets/<id>/<name>` with source `generated` and an `attachment.added` event, that `../../notes.txt` and `a/b.txt` fail with `invalid_input` and write nothing, that two files with the same name are both kept, and that `assets::import` tests still pass
- [x] 3.3 Include components' `text` in history entries (D8). Verify with a `history` unit test that a reply's content is its text followed by its component's text, counted in the budget
- [x] 3.4 Bump the link protocol to 4 on both sides and stop treating `call.component` as reserved in comments and docs (D9). Verify with the existing version-mismatch test updated to 3 vs 4; `cargo test` passes

## 4. Sidecar

- [x] 4.1 Add `ctx.component(kind, version, data, text)` and `ctx.write_asset(name, media_type, data)` to `CallContext` (D1, D6). Verify by running the sidecar's `echo`-style smoke check from the scratchpad against a fake link, so each sends the right `core.request` and returns the result or raises `CoreRequestError`
- [x] 4.2 Find Papers: write the count line or narrative, add `paper-sources` with up to 50 papers, and fall back to the text list on rejection (D7, asta spec). Verify with a scratchpad script that the built data matches the `paper-sources` schema for the recorded Paper Finder fields, and that the fallback text is today's list
- [x] 4.3 Theorize: split out `theories_data`, render the Markdown fallback from it, add `theories`, and write `theory-store.json` (D7). Verify with the scratchpad fixture that the data matches the `theories` schema, citations number the cited papers, and the fallback matches the current reply

## 5. UI

- [x] 5.1 Render components under a reply's text, with the `text` fallback for an unknown kind or version and an error boundary per component (D5, spec "Components appear below a reply's text", "Unknown kinds fall back to text"). Verify with a frontend test of the catalogue lookup returning the fallback for an unknown kind and version; `npm run build` passes
- [x] 5.2 Build the `paper-sources` renderer: five cards, "Show all sources (N)", and links opened with `openUrl` only for `http(s)`. Verify the link check with a frontend test; the user checks the cards, "Show all sources" and opening a paper with `npm run tauri dev`
- [x] 5.3 Build the `theories` renderer: a wording Select per theory, statements, evidence with `[n]` citations, and references listed once. The user checks with a stored or new Theorist reply that each theory switches on its own, and that citations match the references

## 6. Integration and docs

- [x] 6.1 The user runs Researcher and Theorist once each in `npm run tauri dev`. Verify that both show their line and component, that Theorist attaches `theory-store.json`, that a follow-up such as "summarize the third paper" sees the component's text, and that `sidecar.log` shows no rejected component
- [x] 6.2 Update the README (Interactive Components in "Asking a Mini-Me", a link to the developer guide) and `docs/architecture.md` (kinds as one renderer file each, Traits listing their kinds, no schemas). Show the diff to the user before committing
- [x] 6.3 Run `cargo test`, `cargo test -- --include-ignored`, `npm test`, `npm run build` and `npm run bundle-sidecar`, and confirm all pass

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its specs into `openspec/specs/`.
- Mark row 8 of the README Roadmap "Done" and the next one "Next", and show the diff before
  committing.
