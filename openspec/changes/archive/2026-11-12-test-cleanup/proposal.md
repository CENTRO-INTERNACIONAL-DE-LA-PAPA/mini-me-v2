# Proposal

## Why

The test suites have grown past what they protect. Many tests check a version number, restate
data such as `library/builtin.json`, test a dependency (serde, uuid, pydantic, LangChain), drive
fake AI models against the rule in `openspec/config.yaml`, or repeat another test. They break on
harmless edits and hide the tests that matter. This is the first of the refactor changes
(Roadmap #24 to #28), and it goes first so the later ones are checked by a lean suite that can be
trusted.

## What Changes

- **Version tests go**: tests that pin a version number or check a toolchain rather than our code
  (the sidecar protocol number, the app version against `package.json`, Quarto's minimum as a
  tuple comparison, the "forward compatibility" event tests).
- **Migration tests are cut** to the migrations that change data (from versions 6, 10 and 11), plus
  the "newer database is refused" and fresh-database tests; the schema-only ones go.
- **Snapshot tests go**: tests that restate `builtin.json` (Trait names, tool lists, Mini-Me
  counts), exact tool lists, and hand-written lists of event and frame names.
- **Dependency and trivial tests go**: serde round-trips of derived types, uuid ordering, pydantic
  validation, LangChain callbacks, constants, and one-line lookups.
- **Sidecar model-call tests go**, as `openspec/config.yaml` requires: tests that stream fake chat
  models through adapters, drafts, summaries and decisions.
- **Duplicates merge** into table tests (for example the 8 key-scope tests in `runs.rs` and the 7
  routing-decision tests in `routing.rs`), and repeated test helpers are shared.
- **The `#[ignore]`d real-sidecar tests go** with their mentions in `docs/`. The Dataverse network
  test stays.
- **BREAKING**: Projects made before comment threads, paused replies or Interactive Components are
  no longer supported. The workarounds for them go with their tests: the check for a missing
  `comment_threads` table, the fallback for a missing paused-replies table in Home's recent list,
  and the defaults for messages stored without components or Steps. Such a Project no longer
  appears in Home's lists until it is opened, which migrates it.
- **Out of scope**: comment rewrites (#25), shared helpers and dead code in app code (#26), file
  splits and merges (#27), and the names listed by both the core and the sidecar (#28). App code
  changes only where a test-only parameter or a workaround above goes.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No requirement changes: the specs never promised support for Projects older than these
features, and the tests removed check no requirement that other tests do not. The change sets
`skip_specs: true`.

## Impact

- Rust core tests in most of `src-tauri/src/`; non-test code in `comments.rs` (`not_a_thread`),
  `recent.rs`, `protocol.rs` (`Message` defaults), `lib.rs` (`app_context`), `sidecar.rs` (the
  real-sidecar harness).
- Frontend tests under `src/`; non-test code in `src/protocol/eventStore.ts` (the components and
  Steps defaults) and `src/components/interactive/table.tsx` (the test-only `initialSorting` prop).
- Sidecar tests in `sidecar/tests/`; `workflow/decide.py`'s test-only `make_chat` parameter.
- `scripts/third-party-lib.test.mjs`.
- `docs/architecture.md` and `docs/development.md` (the ignored tests).
