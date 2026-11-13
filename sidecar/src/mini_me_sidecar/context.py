"""What a running Trait can do: the only surface Traits see of the sidecar and the core."""

import asyncio
import base64
import time
import uuid
from dataclasses import dataclass
from typing import Any, TypedDict, cast

from mini_me_sidecar.link import REDACTED, Link

ASSET_CHUNK_BYTES = 1024 * 1024

# Progress frames per call are spaced at least this far apart (four per second).
PROGRESS_INTERVAL_S = 0.25


class ResultAsset(TypedDict):
    id: str
    name: str
    media_type: str
    size_bytes: int
    message_id: str
    current: bool


class ResultComponent(TypedDict):
    id: str
    kind: str
    version: int
    message_id: str
    author: str
    current: bool


class Results(TypedDict):
    assets: list[ResultAsset]
    components: list[ResultComponent]


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
    # Tools the Trait may use; a prompt-based Trait's model gets these besides the read tools.
    tools: tuple[str, ...] = ()


@dataclass(frozen=True)
class Model:
    """The provider and model chosen in Settings, for adapters that declare providers."""

    provider: str
    model: str
    # Set only for the `custom` provider.
    endpoint: str | None = None
    api_format: str | None = None

    @classmethod
    def from_frame(cls, raw: dict[str, Any]) -> "Model":
        endpoint, api_format = raw.get("endpoint"), raw.get("api_format")
        return cls(
            provider=str(raw.get("provider", "")),
            model=str(raw.get("model", "")),
            endpoint=str(endpoint) if endpoint else None,
            api_format=str(api_format) if api_format else None,
        )


class CallContext:
    """One Trait call of a Step. A long Trait checks `cancelled` between units of work; blocking
    work must go through `asyncio.to_thread` so the sidecar keeps answering the core."""

    def __init__(
        self,
        link: Link,
        requests: "Requests",
        call_id: str,
        start: dict[str, Any],
        run_id: str = "",
        stream: bool = True,
    ):
        """`start` holds `trait`, `model` and `context`; written text streams into `run_id`'s
        reply only when `stream` is set."""
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
            Model.from_frame(model) if isinstance(model, dict) else None
        )
        self.project_id: str | None = context.get("project_id")
        self.conversation_id: str | None = context.get("conversation_id")
        self.message: dict[str, Any] = context.get("message") or {}
        # Routing's answer to whether the message needs earlier context; None when unknown.
        self.needs_context: bool | None = context.get("needs_context")
        # Routing's pick of the file an untagged message means, `{ asset_id, name }`, or None.
        self.file: dict[str, Any] | None = context.get("file")
        # Every Mini-Me of the library, `{ id, name, description }`, for hand-offs.
        self.mini_mes: list[dict[str, Any]] = context.get("mini_mes") or []
        # For a call answering a comment: the thread's document, `{ asset_id, name, passage }`.
        self.document: dict[str, Any] | None = context.get("document")
        # The Mini-Me writing this reply, to tell its own earlier replies from others'.
        self.mini_me_name: str | None = context.get("mini_me_name")
        # The run's earlier Trait Steps, `{ step_id, name, output }`, in finishing order.
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
        # Cached `results()`; cleared when the call adds a file or component.
        self._results: Results | None = None
        # Parsed files by kind and Asset ID, so a file read in parts is read once per call;
        # an Asset's content never changes.
        self.reads: dict[tuple[str, str], Any] = {}

    @property
    def output(self) -> str:
        return "".join(self._written)

    def write(self, text: str) -> None:
        """Appends to `output`, and to the reply when the call streams."""
        if text and not self.ended:
            self._written.append(text)
            if self._stream:
                self._link.send({"type": "run.delta", "run_id": self.run_id, "text": text})

    def progress(self, label: str, fraction: float | None = None) -> None:
        """`fraction` is 0 to 1 or None; calls within the interval coalesce, latest wins."""
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

    async def results(self) -> Results:
        """Newest first; cached until the call adds a file or component."""
        if self._results is None:
            found = await self._requests.send(self.call_id, "conversation.results", {})
            self._results = cast(Results, found)
        return self._results

    async def read_component(self, component_id: str) -> dict[str, Any]:
        """`{ kind, version, data, text }`; raises `CoreRequestError` `not_found` for another ID."""
        return await self._requests.send(
            self.call_id, "component.read", {"component_id": component_id}
        )

    async def component(self, kind: str, version: int, data: Any, text: str) -> str:
        """Adds an Interactive Component below the reply and returns its ID; `data` must match
        `src/components/interactive/<kind>.tsx` at `version`, and `text` is its plain-text form.
        Raises `CoreRequestError` `component_not_allowed` (`approval`) or `invalid_component`."""
        result = await self._requests.send(
            self.call_id,
            "component.add",
            {"kind": kind, "version": version, "data": data, "text": text},
        )
        self._results = None
        return str(result["component_id"])

    async def edit_document(
        self, asset_id: str, edits: list[dict[str, str]]
    ) -> dict[str, Any]:
        """Opens a comment thread per `{ find, replace, reason }` and a card below the reply,
        leaving the document as is; returns `{ component_id, threads }`. Raises
        `CoreRequestError` when refused, changing nothing."""
        result = await self._requests.send(
            self.call_id, "document.edit", {"asset_id": asset_id, "edits": edits}
        )
        self._results = None
        return result

    async def hand_off(self, mini_me_id: str, request: str, asset_id: str | None) -> None:
        """Hands `request` and file `asset_id` to `mini_me_id` once the reply completes; raises
        `CoreRequestError` when refused, for example when the reply already hands off."""
        await self._requests.send(
            self.call_id,
            "reply.hand_off",
            {"mini_me_id": mini_me_id, "request": request, "asset_id": asset_id},
        )

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

    async def feature_on(self, feature_id: str) -> bool:
        result = await self._requests.send(self.call_id, "features.active", {})
        return feature_id in result["features"]

    async def search_dataverse(self, params: dict[str, Any]) -> dict[str, Any]:
        """A page of CIP Dataverse's datasets, `{ total, datasets }`, which the core fetches;
        `params` are `{ query, from_year, to_year, start }`."""
        return await self._requests.send(self.call_id, "dataverse.search", params)

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
