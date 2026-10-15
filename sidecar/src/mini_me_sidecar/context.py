"""What a running Trait can do: the only surface Traits see of the sidecar and the core."""

import asyncio
import base64
import time
import uuid
from dataclasses import dataclass
from typing import Any

from mini_me_sidecar.link import REDACTED, Link

ASSET_CHUNK_BYTES = 1024 * 1024

# Progress frames per call are spaced at least this far apart (four per second).
PROGRESS_INTERVAL_S = 0.25


class Secret:
    """A provider secret. Prints as `[redacted]`; call `reveal()` only where it is used."""

    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        self._value = value

    def reveal(self) -> str:
        return self._value

    def __repr__(self) -> str:
        return REDACTED

    __str__ = __repr__


class TraitError(Exception):
    """Raise to end a call with a specific error code instead of `trait_error`."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class CoreRequestError(TraitError):
    """The core refused a request. Left uncaught, it ends the call with the core's code."""


@dataclass(frozen=True)
class TraitDefinition:
    """The Trait being run, as defined in the Rust core's Trait library."""

    id: str
    name: str
    instructions: str | None


@dataclass(frozen=True)
class Model:
    """The provider and model chosen in Settings, for adapters that declare providers."""

    provider: str
    model: str


class CallContext:
    """One Trait call. `cancelled` is set when the call is cancelled; a long-running Trait
    checks it between units of work and returns early. Blocking work must go through
    `asyncio.to_thread`, so the sidecar keeps answering the core while the Trait runs."""

    def __init__(self, link: Link, requests: "Requests", call_id: str, start: dict[str, Any]):
        """`start` is the `call.start` frame."""
        context = start.get("context") or {}
        trait = start.get("trait") or {}
        model = start.get("model")
        self.call_id = call_id
        self.trait = TraitDefinition(
            id=str(trait.get("id", "")),
            name=str(trait.get("name", "")),
            instructions=trait.get("instructions"),
        )
        self.model = (
            Model(provider=str(model.get("provider", "")), model=str(model.get("model", "")))
            if isinstance(model, dict)
            else None
        )
        self.project_id: str | None = context.get("project_id")
        self.conversation_id: str | None = context.get("conversation_id")
        self.message: dict[str, Any] = context.get("message") or {}
        # Routing's answer to whether the message needs earlier context; None when unknown.
        self.needs_context: bool | None = context.get("needs_context")
        # The Mini-Me whose reply this call writes, which tells its own replies from others'.
        self.mini_me_name: str | None = context.get("mini_me_name")
        self.cancelled = asyncio.Event()
        self.ended = False
        self._link = link
        self._requests = requests
        self._progress_sent_at = 0.0
        self._pending_progress: tuple[str, float | None] | None = None
        self._progress_timer: asyncio.TimerHandle | None = None

    def write(self, text: str) -> None:
        """Appends `text` to the reply."""
        if text and not self.ended:
            self._link.send({"type": "call.delta", "call_id": self.call_id, "text": text})

    def progress(self, label: str, fraction: float | None = None) -> None:
        """Reports what the Trait is doing; `fraction` is from 0 to 1, or None if unknown.
        Calls closer together than the progress interval are coalesced, latest wins."""
        if self.ended:
            return
        self._pending_progress = (label, fraction)
        wait = self._progress_sent_at + PROGRESS_INTERVAL_S - time.monotonic()
        if wait <= 0:
            self.flush_progress()
        elif self._progress_timer is None:
            loop = asyncio.get_running_loop()
            self._progress_timer = loop.call_later(wait, self.flush_progress)

    def flush_progress(self) -> None:
        self._progress_timer = None
        if self._pending_progress is None or self.ended:
            return
        label, fraction = self._pending_progress
        self._pending_progress = None
        self._progress_sent_at = time.monotonic()
        self._link.send(
            {"type": "call.progress", "call_id": self.call_id, "label": label, "fraction": fraction}
        )

    async def read_asset(self, asset_id: str) -> bytes:
        """The whole content of an Asset of this call's Project."""
        parts: list[bytes] = []
        offset = 0
        while True:
            result = await self._requests.send(
                self.call_id,
                "asset.read",
                {"asset_id": asset_id, "offset": offset, "length": ASSET_CHUNK_BYTES},
            )
            data = base64.b64decode(result["data"])
            parts.append(data)
            offset += len(data)
            if result.get("eof") or not data:
                return b"".join(parts)

    async def history(self) -> dict[str, Any]:
        """The Conversation's earlier messages, `{ messages, truncated }`, oldest first."""
        return await self._requests.send(self.call_id, "conversation.history", {})

    async def secret(self, provider: str) -> Secret:
        """The secret for `provider`, which must be in the Trait's declared providers."""
        result = await self._requests.send(self.call_id, "secret.get", {"provider": provider})
        return Secret(result["value"])


class Requests:
    """Requests from Traits to the core, matched to their `core.response` by `request_id`."""

    def __init__(self, link: Link) -> None:
        self._link = link
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}

    async def send(self, call_id: str, method: str, params: dict[str, Any]) -> dict[str, Any]:
        request_id = uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        self._link.send(
            {
                "type": "core.request",
                "request_id": request_id,
                "call_id": call_id,
                "method": method,
                "params": params,
            }
        )
        try:
            return await future
        finally:
            self._pending.pop(request_id, None)

    def resolve(self, frame: dict[str, Any]) -> None:
        future = self._pending.get(frame.get("request_id", ""))
        if future is None or future.done():
            return
        error = frame.get("error")
        if error:
            future.set_exception(CoreRequestError(error.get("code", ""), error.get("message", "")))
        else:
            future.set_result(frame.get("result") or {})
