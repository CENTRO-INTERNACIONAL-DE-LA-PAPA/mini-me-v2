"""Traits that exercise the runtime from the Rust tests. Registered only with `--test-traits`."""

import asyncio
import hashlib
import os
from typing import Any

from mini_me_sidecar.context import CallContext
from mini_me_sidecar.traits.base import Trait, TraitInfo

ANY_INPUT: dict[str, Any] = {"type": "object"}


def _info(id: str, name: str, description: str, providers: tuple[str, ...] = ()) -> TraitInfo:
    return TraitInfo(id=id, name=name, description=description, input_schema=ANY_INPUT,
                     providers=providers)


class Fail(Trait):
    info = _info("test-fail", "Fail", "Raises an error.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        raise RuntimeError("This Trait always fails.")


class Hang(Trait):
    info = _info("test-hang", "Hang", "Waits until it is cancelled.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        await ctx.cancelled.wait()


class IgnoreCancellation(Trait):
    info = _info("test-ignore-cancel", "Ignore Cancellation",
                 "Keeps running for 30 seconds whatever happens.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + 30
        while loop.time() < deadline:
            try:
                await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                continue
            ctx.write(".")


class ReportProgress(Trait):
    info = _info("test-progress", "Report Progress", "Reports progress 100 times in a burst.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        for step in range(1, 101):
            ctx.progress(f"Step {step}", step / 100)
            await asyncio.sleep(0.005)


class ReadAsset(Trait):
    info = _info("test-read-asset", "Read Asset", "Reports the size and SHA-256 of an Asset.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        data = await ctx.read_asset(str(input.get("asset_id")))
        ctx.write(f"{len(data)} {hashlib.sha256(data).hexdigest()}")


class UseSecret(Trait):
    info = _info("test-use-secret", "Use Secret",
                 "Reports the length of the dummy provider's secret.", providers=("dummy",))

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        secret = await ctx.secret(str(input.get("provider", "dummy")))
        ctx.write(f"secret length {len(secret.reveal())}")


class Exit(Trait):
    info = _info("test-exit", "Exit", "Ends the sidecar process at once.")

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        os._exit(3)


TEST_TRAITS: list[Trait] = [
    Fail(), Hang(), IgnoreCancellation(), ReportProgress(), ReadAsset(), UseSecret(), Exit(),
]
