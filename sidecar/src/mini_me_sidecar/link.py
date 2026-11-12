"""The link to the Rust core: one JSON object per line, UTF-8, on the reserved stdout."""

import asyncio
import json
import os
import sys
import threading
from collections.abc import Callable, Coroutine
from typing import Any, BinaryIO

PROTOCOL = 15

REDACTED = "[redacted]"

Frame = dict[str, Any]


def redact(frame: Frame) -> Frame:
    """A copy safe to log: a `core.response` result's secret `value` is replaced."""
    result = frame.get("result")
    if frame.get("type") == "core.response" and isinstance(result, dict) and "value" in result:
        return {**frame, "result": {**result, "value": REDACTED}}
    return frame


def parse(line: bytes) -> Frame | None:
    """The frame on `line`, or None (logged) when it is not a JSON object with a `type`."""
    try:
        frame = json.loads(line)
    except ValueError:
        log(f"ignoring unreadable line: {line[:200]!r}")
        return None
    if not isinstance(frame, dict) or not isinstance(frame.get("type"), str):
        log(f"ignoring line without a frame type: {line[:200]!r}")
        return None
    return frame


def log(message: str) -> None:
    print(f"[sidecar] {message}", file=sys.stderr, flush=True)


class Link:
    """Writes frames to the core. Safe to call from any thread."""

    def __init__(self, out: BinaryIO) -> None:
        self._out = out
        self._lock = threading.Lock()
        self.log_frames = os.environ.get("MINI_ME_LOG_FRAMES") == "1"

    def send(self, frame: Frame) -> None:
        data = (json.dumps(frame, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
        if self.log_frames:
            log(f"-> {json.dumps(redact(frame), ensure_ascii=False)}")
        with self._lock:
            view = memoryview(data)
            while view:
                written = self._out.write(view)
                view = view[written:]

    def received(self, frame: Frame) -> None:
        if self.log_frames:
            log(f"<- {json.dumps(redact(frame), ensure_ascii=False)}")


class RequestTasks:
    def __init__(self, link: Link, kind: str) -> None:
        self._link = link
        self._kind = kind
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def start(
        self, frame: Frame, work: Callable[[str, Frame], Coroutine[Any, Any, None]]
    ) -> asyncio.Task[None] | None:
        """Runs `work` with the frame's `<kind>_id`; None (logged) when it has none."""
        request_id = frame.get(f"{self._kind}_id")
        if not isinstance(request_id, str):
            log(f"ignoring {self._kind}.start without a {self._kind}_id: {frame!r}")
            return None
        task = asyncio.create_task(work(request_id, frame))
        self._tasks[request_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(request_id, None))
        return task

    def cancel(self, request_id: Any) -> None:
        task = self._tasks.get(request_id) if isinstance(request_id, str) else None
        if task is not None:
            task.cancel()

    def error(self, request_id: str, code: str, message: str, **extra: Any) -> None:
        error = {"code": code, "message": message}
        self._link.send(
            {"type": f"{self._kind}.error", f"{self._kind}_id": request_id, "error": error, **extra}
        )

    async def close(self) -> None:
        for task in list(self._tasks.values()):
            task.cancel()
