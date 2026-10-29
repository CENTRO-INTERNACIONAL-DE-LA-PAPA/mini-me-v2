"""The link to the Rust core: one JSON object per line, UTF-8, on the reserved stdout."""

import json
import os
import sys
import threading
from typing import Any, BinaryIO

PROTOCOL = 11

REDACTED = "[redacted]"

Frame = dict[str, Any]


def redact(frame: Frame) -> Frame:
    """A copy of `frame` that is safe to log: `core.response` results carrying a secret
    `value` (the answer to `secret.get`) have it replaced."""
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
