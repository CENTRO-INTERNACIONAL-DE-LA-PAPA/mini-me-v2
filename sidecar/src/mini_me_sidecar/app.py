"""The sidecar's main loop: handshake, frame dispatch and exit on stdin EOF."""

import asyncio
import os
import platform
import sys
import threading
from typing import BinaryIO

from mini_me_sidecar import __version__
from mini_me_sidecar.adapters.data.worker import WORKERS
from mini_me_sidecar.context import Requests
from mini_me_sidecar.documents import Documents
from mini_me_sidecar.link import PROTOCOL, Link, log, parse
from mini_me_sidecar.routing import Router
from mini_me_sidecar.runs import Runs
from mini_me_sidecar.summary import Summarizer
from mini_me_sidecar.adapters import load_adapters


def run(link_out: BinaryIO, test_adapters: bool) -> None:
    link = Link(link_out)
    try:
        asyncio.run(_main(link, test_adapters))
    finally:
        # `os._exit` skips `multiprocessing`'s own clean-up of child processes.
        WORKERS.close()
        # Threads started with `asyncio.to_thread` by a Trait that ignored cancellation would
        # otherwise keep the interpreter alive after the core has gone.
        sys.stderr.flush()
        os._exit(0)


def _read_stdin(loop: asyncio.AbstractEventLoop, inbox: asyncio.Queue[bytes | None]) -> None:
    # A blocking reader thread: asyncio cannot read pipe stdin on every platform's event loop.
    for line in sys.stdin.buffer:
        loop.call_soon_threadsafe(inbox.put_nowait, line)
    loop.call_soon_threadsafe(inbox.put_nowait, None)


async def _main(link: Link, test_adapters: bool) -> None:
    adapters = load_adapters(test_adapters)
    requests = Requests(link)
    runs = Runs(link, adapters, requests)
    router = Router(link, requests)
    summarizer = Summarizer(link, requests)
    documents = Documents(link, requests)
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
            case "adapters.list":
                infos = [a.info.to_json() for a in adapters.values()]
                link.send({"type": "adapters", "adapters": infos})
            case "run.start":
                runs.start(frame)
            case "route.start":
                router.start(frame)
            case "summary.start":
                summarizer.start(frame)
            case "draft.start":
                documents.start_draft(frame)
            case "draft.cancel":
                documents.cancel_draft(frame.get("draft_id"))
            case "document.export":
                documents.start_export(frame)
            case "document.preview":
                documents.start_preview(frame)
            case "run.cancel":
                runs.cancel(frame.get("run_id"))
            case "core.response":
                runs.resolve(frame)
            case "shutdown":
                break
            case other:
                log(f"ignoring unknown frame type {other!r}")

    await runs.close()
    await router.close()
    await summarizer.close()
    await documents.close()
