import asyncio
import time

import pytest

from mini_me_sidecar.adapters.data.tables import parse_table
from mini_me_sidecar.adapters.data.worker import Workers
from mini_me_sidecar.context import TraitError


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


def test_a_computation_runs_in_a_worker_that_is_reused():
    async def scenario(workers):
        first = await workers.run(Context(), parse_table, "trial.csv", b"plot,yield\np1,2.5\n")
        worker = workers._idle[0]
        second = await workers.run(Context(), len, "yield")
        return first, second, worker, list(workers._idle)

    first, second, worker, idle = in_workers(scenario)
    assert list(first.frame.columns) == ["plot", "yield"]
    assert second == 5
    assert idle == [worker]


def test_a_trait_error_in_a_worker_keeps_its_code():
    async def scenario(workers):
        await workers.run(Context(), parse_table, "trial.xlsx", b"not a workbook")

    with pytest.raises(TraitError) as raised:
        in_workers(scenario)
    assert raised.value.code == "table_unreadable"


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
