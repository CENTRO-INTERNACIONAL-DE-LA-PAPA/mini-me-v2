# Proposal

## Why

Comments across the Rust core, the UI and the sidecar are often longer than what they say: they
restate names, list callers, narrate history, or spend four lines on what one line can hold. Some
are wrong or sit on the wrong item. `CLAUDE.md` already has the rules; the code has drifted from
them. This is Roadmap #25, the second of the refactor changes.

## What Changes

- Every comment, doc comment, JSDoc and Python docstring in the Rust core (`src-tauri/src/`), the
  UI (`src/`) and the sidecar (`sidecar/`) is brought to the Comments rules in `CLAUDE.md`: one line
  by default, only what the code cannot say, no restated names, no history, no lists of callers.
- Comments that are wrong or attached to the wrong item are fixed (for example a doc on
  `saveTableCsv` that describes `revealAsset`, and a comment naming an "export" request that does
  not exist).
- A long comment that is right is shortened wherever no information is lost.
- **Out of scope**: any code change, including renames that would make a comment unnecessary
  (#26); the generated shadcn components in `src/components/ui/`; docstrings and descriptions the
  AI model reads (see design.md); `openspec/`, `docs/` and other prose files.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Comments change no behaviour, so the change sets `skip_specs: true`.

## Impact

- Comments only, in `src-tauri/src/` (about 1,200 comment lines), `src/` outside `components/ui/`
  (about 1,050) and `sidecar/` (Python comments and docstrings).
- No change to behaviour, tests or public APIs; every suite must pass unchanged.
