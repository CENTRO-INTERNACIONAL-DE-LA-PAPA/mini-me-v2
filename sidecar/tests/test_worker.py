import asyncio
import time

import pytest

from mini_me_sidecar.adapters.data.worker import Workers


class Context:
    def __init__(self) -> None:
        self.cancelled = asyncio.Event()


def in_workers(scenario):
    """Runs `scenario(workers)` with a pool of its own, ending its workers afterwards."""
    workers = Workers()
    try:
        return asyncio.run(scenario(workers))
    finally:
        workers.close()


def test_stopping_ends_the_worker_at_once():
    async def scenario(workers):
        ctx = Context()
        await workers.run(ctx, len, "warm")
        computing = asyncio.create_task(workers.run(ctx, time.sleep, 10))
        await asyncio.sleep(0.3)
        (worker,) = workers._busy
        started = time.monotonic()
        ctx.cancelled.set()
        with pytest.raises(asyncio.CancelledError):
            await computing
        elapsed = time.monotonic() - started
        after = await workers.run(Context(), len, "next")
        return elapsed, worker.process.is_alive(), after

    elapsed, alive, after = in_workers(scenario)
    assert elapsed < 1
    assert not alive
    assert after == 4
