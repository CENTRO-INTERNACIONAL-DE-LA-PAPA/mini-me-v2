# Design

## Context

- `adapters/data/replies.py` runs each data step with `asyncio.to_thread`: `profile_frame`,
  `run_checks`, `apply_actions`, `join`, `build_chart` and `table_file`. `tools/tables.py`
  `read_table` gets a file's bytes from the core and calls `parse_table` directly on the event
  loop.
- Cancelling a run sets `ctx.cancelled`; after a grace period `runs.py` cancels the run's
  task, and `asyncio.CancelledError` ends it as `cancelled`. A thread started by `to_thread`
  keeps running after either.
- The sidecar ships a standalone CPython (python-build-standalone), started as
  `python -I -X utf8 -m mini_me_sidecar`. `__main__.py` runs only under
  `if __name__ == "__main__"`, so a process started with `multiprocessing`'s `spawn` method
  imports it without starting a second sidecar.
- `stdio.reserve_stdout` keeps the link on a private, non-inheritable descriptor and points
  descriptor 1 at stderr, so a child process cannot write to the link through descriptor 1.
- `app.run` ends the process with `os._exit(0)`, which skips `atexit` and `multiprocessing`'s
  clean-up of children.

## Goals / Non-Goals

**Goals:**
- Stopping a data reply ends its computation within one second.
- Parsing and computing never run on the sidecar's event loop.
- No worker outlives the sidecar, even when the sidecar is killed.

**Non-Goals:**
- Faster computations, or less copying of tables (#32, #31).
- Ending Asta's network calls, or the other work of tools offered to AI models; their table
  parsing moves to workers along with `read_table`.

## Decisions

### 1. A pool of worker processes, owned by the sidecar

All of this lives in the sidecar; the Rust core sees only the run's usual frames.
`adapters/data/worker.py` holds a `Workers` pool, started with
`multiprocessing.get_context("spawn")` on every platform, so a worker never inherits the
sidecar's threads or event loop, as `fork` would.

- `await workers.run(ctx, function, *args)` takes an idle worker (or starts one), sends it
  the function and its arguments over a `multiprocessing` pipe, and waits for the result in a
  thread, so the event loop stays free. Only module-level functions are sent, so they pickle
  by name.
- When the call finishes, the worker goes back to the pool. One idle worker is kept; extra
  idle ones end.
- The first data step after the sidecar starts waits for a worker to start and import pandas
  (about one to two seconds); later steps reuse the idle one. Starting a worker when the
  sidecar starts was left out: it would cost the memory of a pandas process to users who never
  use a data Trait.

*Alternative considered:* `concurrent.futures.ProcessPoolExecutor`. It can't end one task's
process without breaking the pool, which is exactly what stopping needs.

*Alternative considered:* checking `ctx.cancelled` between steps. One long step, such as
parsing a 100 MiB file or a join, would still run to the end.

### 2. Stopping ends the worker

`workers.run` waits for the first of the result and `ctx.cancelled`. When `ctx.cancelled` is
set, or the awaiting task is cancelled, it kills the worker (`Process.kill`), which closes the
pipe and ends the waiting thread, and raises `asyncio.CancelledError`, which `runs.py` already
reports as `run.cancelled`. The killed worker is not returned to the pool.

### 3. Errors cross the pipe as data

The worker answers `("ok", value)`, `("trait_error", code, message)` for a `TraitError`, or
`("error", text)` for any other exception, with its traceback written to stderr in the worker.
`workers.run` raises `TraitError(code, message)` again, or a `TraitError("trait_error", …)`
without the traceback, as `runs.py` does for errors in the main process. Sending codes and
messages, not exception objects, avoids pickling `TraitError`, whose `__init__` takes two
arguments.

### 4. Workers end with the sidecar

- `app.run` calls `workers.close()` before `os._exit(0)`, killing every worker.
- Each worker also gets a second pipe whose other end only the sidecar holds. A thread in the
  worker blocks on it and calls `os._exit(1)` when it closes, which happens when the sidecar
  exits for any reason, including being killed. This works the same on Windows, macOS and
  Linux, unlike watching the parent's process ID.
- A worker first points descriptor 1 at stderr again (`os.dup2(2, 1)`), so its output can't
  reach the link on a platform where a spawned child gets the original standard output.

### 5. What runs in a worker

`read_table` sends `parse_table(name, data, text)`. `replies.py` sends `profile_frame`,
`run_checks`, `apply_actions`, `join`, `build_chart` and `table_file` instead of calling
`asyncio.to_thread`. Each returns a value that pickles (frames, results, bytes); the result
is copied back to the sidecar. Requests to the core (reading and saving Assets, showing
components) stay in the main process, so workers read and write no file.

## Risks / Trade-offs

- **Copying tables.** A 100 MiB table is pickled to the worker and its result back, for each
  step: a fraction of a second, and twice the memory while it runs. → Accepted; keeping tables
  in the worker between steps is a possible follow-up.
- **The first data step waits for a worker.** → One to two seconds once per sidecar start.
- **Windows process start.** `spawn` re-imports the sidecar's modules in each worker. → The
  entry point is guarded, and a worker imports only what its function needs; covered by a
  test that runs a function in a real worker.
- **Tests start real processes.** → They are few: one result, one error, one kill.
