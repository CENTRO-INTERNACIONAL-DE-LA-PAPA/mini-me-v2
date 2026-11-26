# Tasks

## 1. Reload path in the core

- [x] 1.1 In `runs.rs`, add a method that, under the lock, drops the sink and returns `true`
  only when `runs`, `routes`, `summaries` and `drafts` are all empty. Add one test covering an
  idle `Runs` (detached) and a `Runs` with a run in flight (kept). Verify: `cd src-tauri &&
  cargo test` passes.
- [x] 1.2 In `sidecar.rs`, add a reload request to `Supervisor`: it sends `shutdown` to the
  running sidecar, `serve` then returns a reload outcome instead of a failure, and `run` sets
  `restarting` with "Mini-Me is restarting." and starts again without calling
  `Backoff::failed`. The supervisor loop needs a real process, so reloads not counting as
  failures is checked in the app (2.2). Verify: `cargo test` passes.

## 2. Watching the sources

- [x] 2.1 In `sidecar.rs`, in debug builds only, start a thread that reads the newest
  modification time of the `*.py` files under `Launch::Dev`'s `sidecar/src` about once a second.
  A time newer than the one seen when the sidecar last became ready marks it stale and logs a
  line; while stale and `ready`, it reloads once 1.1 reports idle; while `stopped` or
  `incompatible`, a change calls `Supervisor::restart`. Verify: `cargo test` passes and
  `npx tsc --noEmit` is unaffected (no UI change).
- [x] 2.2 In the app (`npm run tauri:dev`): save a change under `sidecar/src` while idle and
  see the status go to restarting, then ready, with the next reply using the new code; save
  during a long reply and see it finish before the restart; save more than five times in a
  row and see it never reach `stopped`; save a syntax error, wait for
  `stopped`, fix it and see the sidecar come back on its own.

## Workflow follow-up

- No `CHANGELOG.md` line: users never see development builds.
- Archive the change (`/opsx:archive`), syncing the delta into `openspec/specs/sidecar-runtime`.
- Open the pull request into `dev`, closing #13.
