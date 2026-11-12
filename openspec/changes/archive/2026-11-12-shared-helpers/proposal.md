# Proposal

## Why

The same few lines are written by hand many times (a mutex-lock fallback about 60 times, a
settings update-and-save 13 times, an "open as a document or in the system app" branch 6 times),
some functions run to 140-170 lines, database rows are read into 10-value tuples, and unused code
stays in the tree. The code works but is hard to read and to change. This is Roadmap #26, after
the test and comment cleanups, so a lean suite checks it.

## What Changes

- **Repeated code becomes one helper** in the Rust core (lock fallback, status and subscribers,
  write-then-rename, stored-ID parsing, settings update-and-save, the `spawn_blocking` error
  wrapper), the UI (opening a file, OKLCH colour maths, the fetch-on-mount effect, plural wording,
  status-line rows, the two editors' load and save) and the sidecar (request-handler skeleton,
  structured-answer error mapping, the `model_not_set` check, the text input schema).
- **Long functions are split** into named steps: `runs::answer`, `overview()`, `routing::route`,
  SettingsView's settings rows, `graph.py`'s `_Builder.step`, Theorize's `run`.
- **Tuples become named structs** for database rows (`store.rs`, `overview.rs`, `comments.rs`,
  `assets.rs`) and the component tuple in `conversations.rs`.
- **Dead code goes**: unused functions, hooks, props, a generated component nothing imports, and
  `export`s used only in their own file.
- **Renames noted during #25**, so names replace the comments that explained them.
- **Bug fix** (the one behaviour change, approved by the user): a Mini-Me whose solid colour is
  stored as `oklch(...)` (the Brown, Teal, Blue and Pink families and every custom hue) gets
  `NaN` wash and edge colours; merging the OKLCH maths fixes it, as DESIGN.md describes.
- **Out of scope**: splitting or merging files (#27), the tool and provider names both the core
  and the sidecar list (#28), and any other behaviour change.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The refactor keeps behaviour; the colour fix makes the code match DESIGN.md, which no spec
restates. The change sets `skip_specs: true`.

## Impact

- Rust core: most of `src-tauri/src/`; no IPC command, event or frame changes shape.
- UI: `src/` outside `components/ui/` (one unused `ui/` component is deleted).
- Sidecar: `sidecar/src/mini_me_sidecar/`; no change to the link protocol.
- All three test suites pass after every task; tests change only where a helper or rename moves
  what they call.
