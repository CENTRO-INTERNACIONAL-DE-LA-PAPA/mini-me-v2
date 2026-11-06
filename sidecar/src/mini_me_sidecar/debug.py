"""Records a run's model calls and tool calls as `run.debug` entries, the reply's debug
records, while the core asks for them in `context.debug`. A LangChain callback that
`chat_model()` attaches catches every model call, so no call site records its own; tool calls
are recorded with `record_tool`."""

import json
import sys
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.outputs import LLMResult

from mini_me_sidecar.context import Model

ROLES = {"system": "system", "human": "user", "ai": "assistant", "tool": "tool"}


@dataclass(frozen=True)
class Parts:
    """Which parts of each entry to fill: the input messages, the call's details, and the
    tool calls."""

    input: bool
    details: bool
    tools: bool

    @staticmethod
    def from_context(debug: Any) -> "Parts | None":
        """The parts `context.debug` asks for; None when it asks for none."""
        debug = debug if isinstance(debug, dict) else {}
        parts = Parts(
            input=debug.get("input") is True,
            details=debug.get("details") is True,
            tools=debug.get("tools") is True,
        )
        return parts if parts.input or parts.details or parts.tools else None


class Recorder:
    """Records the model calls and tool calls of one Trait call or decision, sending each as an
    entry."""

    def __init__(
        self, parts: Parts, send: Callable[[dict[str, Any]], None], step: str, trait: str | None
    ) -> None:
        self.parts = parts
        self.step = step
        self.trait = trait
        self._send = send
        # The previous model call's ID and whole input, which a call continuing it starts with.
        self._previous: tuple[str, list[dict[str, Any]]] | None = None
        # The ID of the latest model call, which asked for the tool calls that follow it.
        self._last_call: str | None = None

    def model_call(
        self,
        messages: list[BaseMessage],
        model: Model,
        duration_ms: int,
        answer: BaseMessage | None,
    ) -> None:
        call_id = str(uuid.uuid4())
        self._last_call = call_id
        entry: dict[str, Any] = {
            "type": "model_call",
            "id": call_id,
            "step": self.step,
            "trait": self.trait,
            "continues": None,
            "messages": None,
            "provider": None,
            "model": None,
            "duration_ms": None,
            "tokens_in": None,
            "tokens_out": None,
        }
        if self.parts.input:
            read = [_serialised(m) for m in messages]
            entry["messages"] = read
            if self._previous is not None:
                previous_id, previous = self._previous
                if read[: len(previous)] == previous:
                    entry["continues"] = previous_id
                    entry["messages"] = read[len(previous) :]
            self._previous = (call_id, read)
        if self.parts.details:
            usage = getattr(answer, "usage_metadata", None) or {}
            entry.update(
                provider=model.provider,
                model=model.model,
                duration_ms=duration_ms,
                tokens_in=usage.get("input_tokens"),
                tokens_out=usage.get("output_tokens"),
            )
        self._send(entry)

    def tool_call(self, name: str, args: Any, result: str) -> None:
        if not self.parts.tools:
            return
        self._send(
            {
                "type": "tool_call",
                "call": self._last_call,
                "name": name,
                "args": _json(args),
                "result": result,
            }
        )


_recorder: ContextVar[Recorder | None] = ContextVar("debug_recorder", default=None)


@contextmanager
def recording(
    parts: Parts | None, send: Callable[[dict[str, Any]], None], step: str, trait: str | None
) -> Iterator[None]:
    """Records the model calls made inside the block, when `parts` asks for any. Each asyncio
    task has its own copy of the recorder, so parallel Steps record apart."""
    if parts is None:
        yield
        return
    token = _recorder.set(Recorder(parts, send, step, trait))
    try:
        yield
    finally:
        _recorder.reset(token)


def callbacks(model: Model) -> list[BaseCallbackHandler]:
    """The callback handlers for a chat model of `model` built now: one that records its
    calls inside `recording`, none outside."""
    recorder = _recorder.get()
    return [] if recorder is None else [_Handler(recorder, model)]


def record_tool(name: str, args: Any, result: str) -> None:
    """Records a tool call and the `result` its model was given, inside `recording`."""
    if (recorder := _recorder.get()) is not None:
        recorder.tool_call(name, args, result)


class _Handler(BaseCallbackHandler):
    # Called in the event loop's own thread, in order, rather than in a thread pool.
    run_inline = True

    def __init__(self, recorder: Recorder, model: Model) -> None:
        self._recorder = recorder
        self._model = model
        # LangChain's run ID of each call under way → its input and start time.
        self._started: dict[uuid.UUID, tuple[list[BaseMessage], float]] = {}

    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[BaseMessage]],
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        self._started[run_id] = (messages[0] if messages else [], time.monotonic())

    def on_llm_end(self, response: LLMResult, *, run_id: uuid.UUID, **kwargs: Any) -> None:
        started = self._started.pop(run_id, None)
        if started is None:
            return
        messages, began = started
        try:
            generation = response.generations[0][0] if response.generations else None
            answer = getattr(generation, "message", None)
            duration_ms = round((time.monotonic() - began) * 1000)
            self._recorder.model_call(messages, self._model, duration_ms, answer)
        except Exception as error:
            # A recording fault must never fail the model call it records.
            print(f"[debug] could not record a model call: {error!r}", file=sys.stderr, flush=True)

    def on_llm_error(self, error: BaseException, *, run_id: uuid.UUID, **kwargs: Any) -> None:
        self._started.pop(run_id, None)


def _serialised(message: BaseMessage) -> dict[str, Any]:
    """`message` as `{ role, content }`, with a model message's tool calls and a tool result's
    call ID."""
    entry: dict[str, Any] = {
        "role": ROLES.get(message.type, message.type),
        "content": _json(message.content),
    }
    if isinstance(message, AIMessage) and message.tool_calls:
        entry["tool_calls"] = _json(message.tool_calls)
    if isinstance(message, ToolMessage):
        entry["tool_call_id"] = message.tool_call_id
    return entry


def _json(value: Any) -> Any:
    """`value` as plain JSON, with anything else written as text."""
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))
