# Design

## Context

The Rust core's `Supervisor` (`src-tauri/src/sidecar.rs`) starts the sidecar, runs the
handshake, serves frames and loops on the outcome: a failure goes through `Backoff`, which
stops retrying after five consecutive failures; `shutdown` sends the `shutdown` frame and waits
a grace period. In a development build `Launch::Dev` runs `uv run` on the repository's
`sidecar/` project, whose path is known at compile time. The core's `Runs`
(`src-tauri/src/runs.rs`) holds everything in flight: `runs`, `routes`, `summaries` and
`drafts`. Paused replies hold no sidecar state, so they do not keep the sidecar busy.

## Goals / Non-Goals

**Goals:**
- Everything lives in the Rust core, the process that already supervises the sidecar; the
  sidecar does not change.
- Reuse the existing restart loop and status, adding only a reload path beside the failure
  path.

**Non-Goals:**
- Watching anything but `*.py` files under `sidecar/src`.
- Telling the UI that a reload is pending.

## Decisions

These were settled with the user while planning:

- **The core watches and restarts.** In debug builds only (`cfg!(debug_assertions)`), so
  release builds never start the watch.
- **Restart once idle.** A change marks the sidecar stale; the reload happens once nothing is
  in flight in `Runs`, so a running reply finishes on the old code.
- **Poll modification times.** A background thread reads the newest modification time of the
  `*.py` files under `sidecar/src` about once a second. No new dependency; the tree is small,
  and it works the same on Windows, macOS and Linux.
- **A reload is not a failure.** It gets its own outcome in the supervisor loop: status
  `restarting` with "Mini-Me is restarting.", then a normal start, without calling
  `Backoff::failed`.
- **A message sent during a reload fails as at launch.** For the second or two the sidecar
  restarts, a call fails with the existing "Mini-Me's runtime is not ready yet." error, as
  during launch or after a crash. Waiting for the sidecar would add queueing for a
  development-only case.
- **A save also brings back a `stopped` sidecar.** A saved file with an error makes the
  reloaded sidecar fail five times and stop; a later change under `sidecar/src` restarts it
  through the existing `Supervisor::restart`, which resets the failure count as "Try again"
  does (and also leaves `incompatible`). Fixing the file is enough.

How the pieces fit, all in the Rust core:

- **Watch.** The thread remembers the newest modification time seen when the sidecar last
  became ready. A newer one marks the sidecar stale and writes a line to the sidecar log.
- **Idle and detach in one step.** `Runs` gets a method that, under its lock, checks that
  `runs`, `routes`, `summaries` and `drafts` are empty and, if so, drops its sink, so no new
  call can start between the check and the restart. The watch thread calls it while the
  sidecar is stale and ready.
- **Reload.** The supervisor marks a reload as requested and sends `shutdown`, as on app exit.
  When the process ends, `serve` returns the reload outcome instead of a failure, and the loop
  starts the sidecar again.

## Risks / Trade-offs

- [A long reply keeps the old code running] → by design; the reload follows once it ends.
- [Saving several files in a row triggers several reloads] → each poll compares against the
  last ready time, so files saved within one poll interval cause one reload; a later save
  causes another, which is harmless in development.
- [A saved file with a syntax error stops the sidecar from starting] → it fails through the
  existing backoff, the error's traceback is in the sidecar log, and the next save restarts it.
