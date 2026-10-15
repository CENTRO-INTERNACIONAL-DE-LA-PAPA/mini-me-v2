"""Runs Trait calls concurrently, each inside its own error boundary."""

import asyncio
import traceback
import sys
from typing import Any

from mini_me_sidecar.context import CallContext, Requests, TraitError
from mini_me_sidecar.link import Link, log
from mini_me_sidecar.adapters.base import Adapter

# After `call.cancel`, a Trait gets this long to return on its own before its task is
# cancelled. The core stops waiting for the call after five seconds.
CANCEL_GRACE_S = 2.0


class Runner:
    def __init__(self, link: Link, adapters: dict[str, Adapter]) -> None:
        self._link = link
        self._adapters = adapters
        self._requests = Requests(link)
        self._calls: dict[str, tuple[asyncio.Task[None], CallContext]] = {}

    def start(self, frame: dict[str, Any]) -> None:
        call_id = frame.get("call_id")
        if not isinstance(call_id, str) or call_id in self._calls:
            log(f"ignoring call.start with missing or duplicate call_id {call_id!r}")
            return
        adapter = self._adapters.get(frame.get("adapter", ""))
        if adapter is None:
            self._end(call_id, "error", code="unknown_adapter",
                      message=f"There is no adapter called {frame.get('adapter')!r}.")
            return
        ctx = CallContext(self._link, self._requests, call_id, frame)
        task = asyncio.create_task(self._run(adapter, ctx, frame.get("input") or {}))
        self._calls[call_id] = (task, ctx)

    async def _run(self, adapter: Adapter, ctx: CallContext, input: dict[str, Any]) -> None:
        try:
            await adapter.run(ctx, input)
        except asyncio.CancelledError:
            outcome: dict[str, str] = {"kind": "cancelled"}
        except TraitError as error:
            outcome = {"kind": "error", "code": error.code, "message": str(error)}
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            outcome = {"kind": "error", "code": "trait_error",
                       "message": str(error) or type(error).__name__}
        else:
            outcome = {"kind": "cancelled" if ctx.cancelled.is_set() else "done"}
        ctx.flush_progress()
        ctx.ended = True
        self._calls.pop(ctx.call_id, None)
        kind = outcome.pop("kind")
        self._end(ctx.call_id, kind, **outcome)

    def _end(self, call_id: str, kind: str, **error: str) -> None:
        if kind == "error":
            self._link.send({"type": "call.error", "call_id": call_id, "error": error})
        else:
            self._link.send({"type": f"call.{kind}", "call_id": call_id})

    def cancel(self, call_id: str | None) -> None:
        entry = self._calls.get(call_id or "")
        if entry is None:
            return
        task, ctx = entry
        ctx.cancelled.set()
        asyncio.get_running_loop().call_later(CANCEL_GRACE_S, task.cancel)

    def resolve(self, frame: dict[str, Any]) -> None:
        self._requests.resolve(frame)

    async def close(self) -> None:
        for task, _ in list(self._calls.values()):
            task.cancel()
