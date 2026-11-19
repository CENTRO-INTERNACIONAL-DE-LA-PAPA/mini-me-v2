# Proposal

## Why

In development the sidecar loads its Python code once, at start, and the Tauri dev watcher
only watches `src-tauri/`. A saved change to `sidecar/src` therefore takes effect only after
restarting `npm run tauri:dev`, which is easy to forget: a stale sidecar once hid a fix during
the data Traits work (issue #13).

## What Changes

- In a development build, the Rust core notices when a Python file under `sidecar/src` changes
  and restarts the sidecar, so the next Trait call, routing question, summary or draft runs the
  new code.
- The restart waits until nothing is in flight, so a reply that is already being written
  finishes on the code it started with.
- Such a reload is not a failure: it does not count toward the five consecutive failures after
  which the core stops restarting the sidecar. When a saved error has stopped the sidecar,
  saving the fixed file brings it back.
- Release builds are unchanged: they never watch the sidecar's files.

Out of scope:
- Release builds.
- Changes to `sidecar/pyproject.toml` or `sidecar/uv.lock`; a new dependency still needs
  `tauri:dev` restarted.
- A manual "restart the sidecar" action in the app.
- The UI: during a reload it shows the existing restarting status.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sidecar-runtime`: adds a requirement that a development build reloads the sidecar when its
  source changes, once idle, without counting the reload as a failure.

## Impact

- Rust core: `src-tauri/src/sidecar.rs` (`Supervisor`: a stale flag, a reload outcome, a
  debug-only source watch) and `src-tauri/src/runs.rs` (whether anything is in flight).
- Development builds only; no protocol, UI, sidecar or dependency change.
