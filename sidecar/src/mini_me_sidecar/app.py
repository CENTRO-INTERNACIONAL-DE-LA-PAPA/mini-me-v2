"""The sidecar's main loop: handshake, frame dispatch and exit on stdin EOF."""

import asyncio
import os
import platform
import sys
import threading
from typing import BinaryIO

from mini_me_sidecar import __version__
from mini_me_sidecar.link import PROTOCOL, Link, log, parse
from mini_me_sidecar.runner import Runner
from mini_me_sidecar.traits import load_traits


def run(link_out: BinaryIO, test_traits: bool) -> None:
    link = Link(link_out)
    try:
        asyncio.run(_main(link, test_traits))
    finally:
        # Threads started with `asyncio.to_thread` by a Trait that ignored cancellation would
        # otherwise keep the interpreter alive after the core has gone.
        sys.stderr.flush()
        os._exit(0)


def _read_stdin(loop: asyncio.AbstractEventLoop, inbox: asyncio.Queue[bytes | None]) -> None:
    # A blocking reader thread: asyncio cannot read pipe stdin on every platform's event loop.
    for line in sys.stdin.buffer:
        loop.call_soon_threadsafe(inbox.put_nowait, line)
    loop.call_soon_threadsafe(inbox.put_nowait, None)


async def _main(link: Link, test_traits: bool) -> None:
    traits = load_traits(test_traits)
    runner = Runner(link, traits)
    loop = asyncio.get_running_loop()
    inbox: asyncio.Queue[bytes | None] = asyncio.Queue()
    threading.Thread(target=_read_stdin, args=(loop, inbox), daemon=True).start()

    link.send(
        {
            "type": "hello",
            "protocol": PROTOCOL,
            "sidecar_version": __version__,
            "python_version": platform.python_version(),
        }
    )

    while (line := await inbox.get()) is not None:
        frame = parse(line)
        if frame is None:
            continue
        link.received(frame)
        match frame["type"]:
            case "ping":
                link.send({"type": "pong", "nonce": frame.get("nonce")})
            case "traits.list":
                link.send({"type": "traits", "traits": [t.info.to_json() for t in traits.values()]})
            case "call.start":
                runner.start(frame)
            case "call.cancel":
                runner.cancel(frame.get("call_id"))
            case "core.response":
                runner.resolve(frame)
            case "shutdown":
                break
            case other:
                log(f"ignoring unknown frame type {other!r}")

    await runner.close()
