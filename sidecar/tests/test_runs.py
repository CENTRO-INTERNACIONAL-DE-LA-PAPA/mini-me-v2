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


class Writes(Adapter):
    info = AdapterInfo(id="write", description="", input_schema=TEXT_INPUT)

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        ctx.write("step text")


def test_a_multi_step_run_without_a_model_ends_with_its_last_output(link) -> None:
    async def go() -> None:
        runs = Runs(link, {"write": Writes()}, Requests(link))
        runs.start({
            "run_id": "r",
            "workflow": {"steps": [{"id": "a", "trait": "t"}, {"id": "b", "trait": "t"}]},
            "traits": [{"id": "t", "name": "Plan", "adapter": "write"}],
            "input": {"text": "hi"},
        })
        while not link.sent or link.sent[-1]["type"] not in {"run.done", "run.error"}:
            await asyncio.sleep(0)

    asyncio.run(asyncio.wait_for(go(), 1))
    types = [f["type"] for f in link.sent]
    assert "run.summary" not in types
    assert [f["text"] for f in link.sent if f["type"] == "run.delta"] == ["step text"]

