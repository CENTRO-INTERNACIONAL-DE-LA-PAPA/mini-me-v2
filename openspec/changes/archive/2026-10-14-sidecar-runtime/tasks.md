# Tasks

Builds and tests are run by the user (see CLAUDE.md); a task is done when their run confirms
it.

## 1. Setup

- [x] 1.1 Create the `sidecar/` uv project (`.python-version` with `3.14`, `pyproject.toml` with `requires-python = "==3.14.*"` and no runtime dependencies, empty `mini_me_sidecar` package, committed `uv.lock`) and add `sidecar/.venv`, `__pycache__` and `src-tauri/resources/` to `.gitignore`; verify `uv sync --frozen` in `sidecar/` succeeds and `uv run --frozen python -I -m mini_me_sidecar --help` runs
- [x] 1.2 Add the `base64` crate to `src-tauri/Cargo.toml` and empty Rust modules `sidecar` (process and supervisor), `link` (frames), `trait_calls` and `secrets`; verify `cargo build` succeeds
- [x] 1.3 Document the developer prerequisite (`uv`) and the one-time `uv sync` in the README; verify the documented commands run as written

## 2. Link frames

- [x] 2.1 Define the Rust frame types for every frame in the specs (`hello`, `traits.list`, `traits`, `ping`, `pong`, `shutdown`, `call.start`, `call.delta`, `call.progress`, `call.done`, `call.error`, `call.cancel`, `call.cancelled`, `core.request`, `core.response`) plus the `SIDECAR_PROTOCOL` constant, with unknown types parsed as ignorable; verify with a unit test that an unknown `type` and a non-JSON line are ignored without error
- [x] 2.2 Create `protocol/fixtures/sidecar-frames.json` with one example of every frame type and a Rust test that round-trips each entry without loss; verify `cargo test` passes

## 3. Sidecar (Python)

- [x] 3.1 Implement stdout reservation (D6) and the link reader/writer in `link.py`, exiting on stdin EOF and answering `ping` with `pong`; verify manually by piping `{"type":"ping","nonce":"1"}` into `uv run --frozen python -I -m mini_me_sidecar` and seeing `hello` then `pong` on stdout and nothing else
- [x] 3.2 Implement the Trait adapter interface (`TraitInfo`, `CallContext`, `Trait`) and discovery answering `traits.list`; verify manually that `traits` lists `echo` with `name` `Echo`
- [x] 3.3 Implement the call runner (D5): one task per call, error boundary (`trait_error`, traceback to stderr), `unknown_trait`, cancellation with grace period, progress throttling, `core.request`/`core.response` futures with a redacting `Secret` type
- [x] 3.4 Implement the *Echo* Trait and the `--test-traits` Traits (fail, hang, ignore cancellation, read Asset, use dummy secret, exit process); verify manually that a piped `call.start` for `echo` returns deltas and `call.done`

## 4. Supervisor and status (Rust core)

- [x] 4.1 Implement process launch for development (`uv run --frozen …`) and release (`<resources>/sidecar/python … -I launch.py`), with stdin/stdout/stderr threads and the stderr copy into the rotating `sidecar.log` (D11); verify with a unit test that rotation keeps one previous file at the size limit
- [x] 4.2 Implement the handshake (D8) with start timeout and the mismatch detail text, including the stale-side hint in debug builds; verify with unit tests for match, mismatch in both directions and timeout using a fake link
- [x] 4.3 Implement the supervisor state machine, `ping`/`pong` check, backoff (0.5 s → 4 s, give up at the fifth failure, reset after 60 s ready), `shutdown` on exit, and status publishing; verify with unit tests on a fake link and a fake clock that the delays, the give-up after five failures and the reset are correct
- [x] 4.4 Add `get_sidecar_status`, `subscribe_sidecar_status` and `restart_sidecar` commands and start the supervisor in `setup`; verify in `npm run tauri dev` that `get_sidecar_status` returns `ready` from the devtools console

## 5. Trait calls and secrets (Rust core)

- [x] 5.1 Implement the `TraitCalls` registry (D4): `send_message` refuses with `sidecar_unavailable` when not ready, otherwise starts the reply and sends `call.start` to *Echo*; frames map to `message.delta`, `message.progress`, `message.completed`, `message.failed`, `message.cancelled`; late frames are ignored; verify with unit tests on a fake link for each mapping and for a late `call.delta` after `call.done`
- [x] 5.2 Add `message.progress` to `protocol.rs` and `protocol/fixtures/events.json`; verify the existing fixture round-trip test passes with the new entry
- [x] 5.3 Connect `stop_reply` to `call.cancel` with the 5 s close timer, and fail open replies with `sidecar_stopped` when the process stops; verify with unit tests that a stop sends `call.cancel` and later frames are dropped, and that a simulated exit fails every streaming reply with `sidecar_stopped`
- [x] 5.4 Implement `asset.read` (D9) through `assets::file_path` with the 1 MiB cap and `call_not_active`/`unknown_method` errors; verify with unit tests that a 2.5 MiB Asset reads in three chunks ending with `eof`, and that an Asset from another Project returns `not_found`
- [x] 5.5 Implement `Secret`, `SecretSource` (`NoSecrets` and an in-memory test source), `secret.get` checks and frame-log redaction (D10); verify with unit tests for allowed, `secret_not_allowed`, `secret_unavailable`, that `Debug` prints `[redacted]`, and that a logged response hides the value
- [x] 5.6 Delete `echo.rs` and its spawn in `ipc.rs`; verify `cargo test` passes and no reference to the module remains

## 6. Real-sidecar tests

- [x] 6.1 Add `#[ignore]` Rust tests that start the real sidecar with `--test-traits` through `uv run`: handshake and discovery, *Echo* streaming, cancellation, error boundary while another call streams, a Trait ignoring cancellation, the dummy secret not appearing in persisted events, and a process exit followed by a restart to `ready`; verify with `cargo test -- --include-ignored`

## 7. Frontend

- [x] 7.1 Add `message.progress` and the sidecar status types to `src/protocol/types.ts`, and progress handling to `eventStore` (set on progress, cleared when the message ends); verify with Vitest tests using the updated fixture
- [x] 7.2 Add `getSidecarStatus`, `subscribeSidecarStatus` and `restartSidecar` to `api.ts`, and a status line in the Project picker and Project sidebar (hidden when ready, "Try again" when stopped); verify manually by killing the sidecar process in `npm run tauri dev` and watching restarting → ready
- [x] 7.3 Disable the composer with the status detail as its hint while the sidecar is not ready, and show the progress label (and fraction) under a streaming reply; verify manually against the "Sidecar not ready" and "Reply progress is shown" scenarios

## 8. Release bundle

- [x] 8.1 Write `sidecar/scripts/bundle.py` (D7), the `bundle-sidecar` and `tauri:release` npm scripts, and `src-tauri/tauri.release.conf.json` with the `beforeBuildCommand` and `bundle.resources` entries; verify `npm run bundle-sidecar` produces `src-tauri/resources/sidecar/` with the interpreter, `packages/` and `launch.py`
- [x] 8.2 Build a release on macOS (`npm run tauri:release`), open the built app, and confirm the sidecar reaches `ready` and *Echo* answers with `PYTHONPATH` set to a bogus folder. The first Windows install check (OfficeScan behaviour and the bundled `python.exe` path for the IT allowlist) moves to change 3, which produces the Windows installers

## 9. Integration check

- [x] 9.1 Run `cargo test`, `cargo test -- --include-ignored` and `npm test` and confirm all pass
- [x] 9.2 Walk through end to end in `npm run tauri dev`: send a message and watch *Echo* stream, stop a reply, kill the sidecar process mid-reply and confirm the reply fails with `sidecar_stopped` and the status returns to ready, close the app and confirm no Python process remains

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its specs into `openspec/specs/`.
- Mark change 2 "Done" and change 3 "Next" in the README Roadmap, then commit and push once.
