# Proposal

## Why

Stopping a reply while a data Trait computes doesn't stop the computation (issue #10). The
data Traits run pandas and pointblank in a thread with `asyncio.to_thread`, and Python cannot
interrupt a running thread: the reply ends as cancelled, but the work runs to the end and keeps
using CPU and memory, which matters for files up to 100 MiB. Reading a table is worse: parsing
runs on the sidecar's event loop itself, so a large file also delays every other reply.

## What Changes

- The data Traits' heavy work (parsing a table, profiling, checking, cleaning, joining,
  building a chart and building a result file's content) runs in a separate worker process
  that the sidecar can end at any moment. Saving the file stays a request to the core.
- Stopping a data reply ends its worker at once, so the work stops within a second. The next
  data reply gets a new worker.
- The sidecar keeps one idle worker ready, so a data reply doesn't wait for one to start, and
  starts more when several data replies run at the same time. Idle workers beyond the first
  end.
- Workers end with the sidecar.

What users see: pressing Stop on a data reply frees the computer within a second, even on a
large file, and other replies keep streaming while a large table is read.

Out of scope:
- Speeding up the computations themselves.
- Stopping Asta calls (*Find Papers*, *Theorize*) that wait on the network.
- Other work of tools offered to AI models. Their table parsing (`read_file`, `show_table`)
  does move to workers, since it shares `read_table` with the data Traits.

No new external service, credential or cost, and no new dependency: workers use Python's
standard library.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-traits`: a new requirement that stopping a data reply ends its computation within a
  second, and that reading a table doesn't hold up other replies.

## Impact

- Sidecar: a new `adapters/data/worker.py` (the worker pool), `adapters/data/replies.py` and
  `tools/tables.py` (`read_table`) running their work through it, `app.py` (ending workers on
  exit).
- Memory: one idle worker process with pandas loaded, and a copy of each table while a step
  runs in a worker.
- No Rust core or UI change.
