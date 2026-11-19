import asyncio
from typing import Any

from mini_me_sidecar.adapters.base import TEXT_INPUT, Adapter, AdapterInfo
from mini_me_sidecar.context import CallContext, Requests
from mini_me_sidecar.runs import Runs


class UntilCancelled(Adapter):
    info = AdapterInfo(id="wait", description="", input_schema=TEXT_INPUT)

    def __init__(self) -> None:
        self.started = asyncio.Event()

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        self.started.set()
        await ctx.cancelled.wait()


def test_cancelling_during_a_trait_step_ends_the_run_as_cancelled(link, capsys) -> None:
    async def go() -> None:
        adapter = UntilCancelled()
        runs = Runs(link, {"wait": adapter}, Requests(link))
        runs.start({
            "run_id": "r",
            "workflow": {"steps": [{"id": "plan", "trait": "t"}, {"id": "after", "trait": "t"}]},
            "traits": [{"id": "t", "name": "Plan", "adapter": "wait"}],
            "input": {"text": "hi"},
        })
        await adapter.started.wait()
        runs.cancel("r")
        while not link.sent or link.sent[-1]["type"] not in {"run.cancelled", "run.error"}:
            await asyncio.sleep(0)

    asyncio.run(asyncio.wait_for(go(), 1))
    assert [f["type"] for f in link.sent] == ["step.started", "run.cancelled"]
    assert capsys.readouterr().err == ""
