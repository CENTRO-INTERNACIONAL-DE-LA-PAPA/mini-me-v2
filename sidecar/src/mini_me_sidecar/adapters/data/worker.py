"""Worker processes for the data Traits' computations. Unlike a thread, a worker can be ended
at once when its run is stopped, and while it computes the sidecar's event loop stays free.
Workers only compute: reading and saving Assets stay requests to the core."""

import asyncio
import multiprocessing
import os
import sys
import threading
import traceback
from collections.abc import Callable
from multiprocessing.connection import Connection
from typing import Any

from mini_me_sidecar.context import CallContext, TraitError

# Spawned rather than forked, on every platform: a forked worker would inherit the sidecar's
# threads and event loop.
_SPAWN = multiprocessing.get_context("spawn")


class Worker:
    """One worker process, the pipe it takes work on, and the lifeline it watches. The
    sidecar holds the only other end of the lifeline, so the worker exits whenever the
    sidecar does, however it ends."""

    def __init__(self) -> None:
        self.work, child_work = _SPAWN.Pipe()
        self._lifeline, child_lifeline = _SPAWN.Pipe()
        self.process = _SPAWN.Process(
            target=_serve, args=(child_work, child_lifeline), name="mini-me-data", daemon=True
        )
        self.process.start()
        # The child has its own copies of these ends now. Keeping them open here would stop
        # the worker from ever seeing its pipes close.
        child_work.close()
        child_lifeline.close()

    def kill(self) -> None:
        self.process.kill()
        self.process.join(timeout=1)
        self.work.close()
        self._lifeline.close()


class Workers:
    """A pool of workers: one stays idle between computations, and more start while several
    compute at once."""

    def __init__(self) -> None:
        self._idle: list[Worker] = []
        self._busy: set[Worker] = set()

    async def run(self, ctx: CallContext, function: Callable[..., Any], *args: Any) -> Any:
        """`function(*args)`, computed in a worker; `function` must be importable by name.
        Raises the `TraitError` the function raised, or `trait_error` for any other error.
        When `ctx` is cancelled, or the awaiting task is, ends the worker at once and raises
        `asyncio.CancelledError`."""
        if ctx.cancelled.is_set():
            raise asyncio.CancelledError
        worker = self._idle.pop() if self._idle else await asyncio.to_thread(Worker)
        self._busy.add(worker)
        try:
            answer = await _answer(ctx, worker, function, args)
        except BaseException:
            self._busy.discard(worker)
            worker.kill()
            raise
        self._busy.discard(worker)
        if self._idle:
            worker.kill()
        else:
            self._idle.append(worker)
        match answer:
            case ("ok", value):
                return value
            case ("trait_error", code, message):
                raise TraitError(code, message)
            case (_, message):
                raise TraitError("trait_error", message)

    def close(self) -> None:
        """Ends every worker."""
        for worker in [*self._idle, *self._busy]:
            worker.kill()
        self._idle.clear()
        self._busy.clear()


WORKERS = Workers()


async def _answer(
    ctx: CallContext, worker: Worker, function: Callable[..., Any], args: tuple[Any, ...]
) -> tuple[Any, ...]:
    """Sends `worker` the computation and waits for its answer or for `ctx` to be cancelled,
    in threads, since a pipe can't be awaited on every platform's event loop."""
    await asyncio.to_thread(worker.work.send, (function, args))
    reply = asyncio.ensure_future(asyncio.to_thread(worker.work.recv))
    # Ending the worker makes `recv` fail; that failure is expected and needs no report.
    reply.add_done_callback(lambda done: done.cancelled() or done.exception())
    stop = asyncio.ensure_future(ctx.cancelled.wait())
    try:
        await asyncio.wait({reply, stop}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        stop.cancel()
    if not reply.done():
        raise asyncio.CancelledError
    try:
        return reply.result()
    except (EOFError, OSError):
        raise TraitError(
            "worker_failed",
            "The computation stopped before it finished, possibly for lack of memory.",
        ) from None


def _serve(work: Connection, lifeline: Connection) -> None:
    """A worker's main function: computes what it receives until its pipe closes."""
    # On a platform where a spawned child gets the original standard output, descriptor 1
    # would be the sidecar's link.
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    threading.Thread(target=_watch, args=(lifeline,), daemon=True).start()
    while True:
        try:
            function, args = work.recv()
        except (EOFError, OSError):
            return
        try:
            work.send(("ok", function(*args)))
        except TraitError as error:
            work.send(("trait_error", error.code, str(error)))
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            work.send(("error", str(error) or type(error).__name__))


def _watch(lifeline: Connection) -> None:
    """Ends the worker once the sidecar's end of `lifeline` closes."""
    try:
        lifeline.recv()
    except (EOFError, OSError):
        pass
    os._exit(1)
