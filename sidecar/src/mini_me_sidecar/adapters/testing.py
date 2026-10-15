"""Adapters that exercise the runtime from the Rust tests. Registered only with
`--test-adapters`."""

import asyncio
import hashlib
import os
from typing import Any

from mini_me_sidecar.context import CallContext
from mini_me_sidecar.adapters.base import Adapter, AdapterInfo

ANY_INPUT: dict[str, Any] = {"type": "object"}


def _info(id: str, description: str, providers: tuple[str, ...] = ()) -> AdapterInfo:
    return AdapterInfo(id=id, description=description, input_schema=ANY_INPUT,
                       providers=providers)


class Fail(Adapter):
    info = _info("test-fail", "Raises an error.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        raise RuntimeError("This adapter always fails.")


class Hang(Adapter):
    info = _info("test-hang", "Waits until it is cancelled.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        await ctx.cancelled.wait()


class IgnoreCancellation(Adapter):
    info = _info("test-ignore-cancel", "Keeps running for 30 seconds whatever happens.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + 30
        while loop.time() < deadline:
            try:
                await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                continue
            ctx.write(".")


class ReportProgress(Adapter):
    info = _info("test-progress", "Reports progress 100 times in a burst.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        for step in range(1, 101):
            ctx.progress(f"Step {step}", step / 100)
            await asyncio.sleep(0.005)


class ReadAsset(Adapter):
    info = _info("test-read-asset", "Reports the size and SHA-256 of an Asset.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        data = await ctx.read_asset(str(input.get("asset_id")))
        ctx.write(f"{len(data)} {hashlib.sha256(data).hexdigest()}")


class UseSecret(Adapter):
    info = _info("test-use-secret", "Reports the length of the dummy provider's secret.",
                 providers=("dummy",))

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        secret = await ctx.secret(str(input.get("provider", "dummy")))
        ctx.write(f"secret length {len(secret.reveal())}")


class Exit(Adapter):
    info = _info("test-exit", "Ends the sidecar process at once.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        os._exit(3)


TEST_ADAPTERS: list[Adapter] = [
    Fail(), Hang(), IgnoreCancellation(), ReportProgress(), ReadAsset(), UseSecret(), Exit(),
]
