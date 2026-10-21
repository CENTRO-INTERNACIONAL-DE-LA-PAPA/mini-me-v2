# Tasks

## 1. The worker pool

- [x] 1.1 Add `adapters/data/worker.py` with `Workers`: spawned worker processes that point descriptor 1 at stderr, run a module-level function sent over a pipe, answer `ok`, `trait_error` or `error`, and exit when their lifeline pipe closes; `run(ctx, function, *args)` that takes an idle worker or starts one and returns it to the pool, keeping one idle; and `close()`. Verify with pytest that a function's result comes back, that a `TraitError` in a worker is raised again with its code and message, and that a second call reuses the idle worker.
- [x] 1.2 Make `run` end the worker when `ctx.cancelled` is set or its task is cancelled, and raise `asyncio.CancelledError`. Verify with pytest that cancelling a call to a function that sleeps ten seconds returns within one second, that its worker process has ended, and that the next call still runs.
- [x] 1.3 Call `workers.close()` in `app.run` before the process exits. Verify by reading `app.run`, and in the app that no `python` worker process remains after quitting.

## 2. Data work through the pool

- [x] 2.1 Make `read_table` (`tools/tables.py`) parse through the pool. Verify `cd sidecar && uv run pytest` passes and that a data Trait on a CSV and an Excel file still replies.
- [x] 2.2 Replace each `asyncio.to_thread` in `adapters/data/replies.py` with the pool. Verify `uv run pytest` passes and, in the app, that *Profile Data*, *Validate Data*, *Clean Data*, *Join Data* and *Plot* reply as before.
- [x] 2.3 In the app, stop a *Validate Data* reply on a large table and confirm that CPU use drops within a second and that a following data request works.

## 3. Specs and integration

- [x] 3.1 Run `openspec validate data-work-process --strict` and confirm it passes.

## Workflow follow-up

- Archive the change (`/opsx:archive`), then open the pull request into `dev` closing #10.
