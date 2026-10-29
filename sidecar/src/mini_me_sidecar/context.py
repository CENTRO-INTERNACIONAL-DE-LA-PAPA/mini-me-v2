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
    # The tools the Trait may use; for a prompt-based Trait, those its model is offered
    # besides the read tools.
    tools: tuple[str, ...] = ()


@dataclass(frozen=True)
class Model:
    """The provider and model chosen in Settings, for adapters that declare providers."""

    provider: str
    model: str


class CallContext:
    """One Trait call, made by a Step of a Mini-Me run. `cancelled` is set when the run is
    cancelled; a long-running Trait checks it between units of work and returns early.
    Blocking work must go through `asyncio.to_thread`, so the sidecar keeps answering the
    core while the Trait runs."""

    def __init__(
        self,
        link: Link,
        requests: "Requests",
        call_id: str,
        start: dict[str, Any],
        run_id: str = "",
        stream: bool = True,
    ):
        """`start` holds the call's `trait`, `model` and `context`. Text the call writes goes
        into the reply as `run.delta` of `run_id` only when `stream` is set; it is always
        kept as the call's `output`."""
        context = start.get("context") or {}
        trait = start.get("trait") or {}
        model = start.get("model")
        self.call_id = call_id
        self.trait = TraitDefinition(
            id=str(trait.get("id", "")),
            name=str(trait.get("name", "")),
            instructions=trait.get("instructions"),
            tools=tuple(str(t) for t in trait.get("tools") or ()),
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
        # For a call answering a comment: the thread's document, `{ asset_id, name, passage }`.
        self.document: dict[str, Any] | None = context.get("document")
        # The Mini-Me whose reply this call writes, which tells its own replies from others'.
        self.mini_me_name: str | None = context.get("mini_me_name")
        # Outputs of the run's earlier Trait Steps, `{ step_id, name, output }`, in the order
        # they finished.
        self.steps: list[dict[str, Any]] = context.get("steps") or []
        self.run_id = run_id
        self.cancelled = asyncio.Event()
        self.ended = False
        self._link = link
        self._requests = requests
        self._progress_sent_at = 0.0
        self._pending_progress: tuple[str, float | None] | None = None
        self._progress_timer: asyncio.TimerHandle | None = None
        self._stream = stream
        self._written: list[str] = []
        # The Conversation's results, until the call adds a file or component of its own.
        self._results: dict[str, Any] | None = None
        # Files `read_file` has read and parsed, by kind and Asset ID, so that reading a file
        # in parts reads it once per call; an Asset's content never changes.
        self.reads: dict[tuple[str, str], Any] = {}

    @property
    def output(self) -> str:
        """Everything the call has written."""
        return "".join(self._written)

    def write(self, text: str) -> None:
        """Appends `text` to the call's output, and to the reply when the call's Step streams
        into it."""
        if text and not self.ended:
            self._written.append(text)
            if self._stream:
                self._link.send({"type": "run.delta", "run_id": self.run_id, "text": text})

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
            {"type": "run.progress", "run_id": self.run_id, "label": label, "fraction": fraction}
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

    async def results(self) -> dict[str, Any]:
        """The Conversation's Assets and Interactive Components, `{ assets, components }`,
        each newest first. An Asset is `{ id, name, media_type, size_bytes, message_id,
        current }`, where `current` marks the call's own message's files; a component is
        `{ id, kind, version, message_id, author }`. Asked of the core once, and again after
        the call saves a file or adds a component."""
        if self._results is None:
            self._results = await self._requests.send(self.call_id, "conversation.results", {})
        return self._results

    async def read_component(self, component_id: str) -> dict[str, Any]:
        """A component of the Conversation, `{ kind, version, data, text }`. Raises
        `CoreRequestError` with `not_found` for any other ID."""
        return await self._requests.send(
            self.call_id, "component.read", {"component_id": component_id}
        )

    async def component(self, kind: str, version: int, data: Any, text: str) -> str:
        """Adds an Interactive Component below the reply's text and returns its ID. Adapters
        call it through the show tools (`mini_me_sidecar.tools`). `data` must have the shape
        that the kind's renderer for `version` draws (`src/components/interactive/<kind>.tsx`).
        `text` is a plain-text version of it, used in conversation history and wherever the
        kind is not shown. Raises `CoreRequestError` with `component_not_allowed` (an
        `approval`, which only the core adds) or `invalid_component` when the core refuses
        it."""
        result = await self._requests.send(
            self.call_id,
            "component.add",
            {"kind": kind, "version": version, "data": data, "text": text},
        )
        self._results = None
        return str(result["component_id"])

    async def write_asset(self, name: str, media_type: str, data: bytes) -> dict[str, Any]:
        """Saves `data` (at most 32 MiB) in the Project as the file `name`, attaches it to the
        reply, and returns the Asset `{ id, name, media_type, size_bytes }`."""
        result = await self._requests.send(
            self.call_id,
            "asset.write",
            {"name": name, "media_type": media_type, "data": base64.b64encode(data).decode()},
        )
        self._results = None
        return result["asset"]

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
