"""A paused run's state as an opaque string for the core to keep: the graph's latest
checkpoint and its pending writes, serialized as JSON with base64 payloads."""

import base64
import json
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

from mini_me_sidecar.context import TraitError

FORMAT = 1

# The run state holds only JSON values, so pickling is never needed.
SERDE = JsonPlusSerializer(pickle_fallback=False)


def new_saver() -> InMemorySaver:
    return InMemorySaver(serde=SERDE)


def _pack(typed: tuple[str, bytes]) -> list[str]:
    return [typed[0], base64.b64encode(typed[1]).decode()]


def _unpack(packed: list[str]) -> Any:
    return SERDE.loads_typed((packed[0], base64.b64decode(packed[1])))


async def save(saver: BaseCheckpointSaver, thread_id: str) -> str:
    """The latest checkpoint of `thread_id`, with its pending writes, as a string."""
    found = await saver.aget_tuple({"configurable": {"thread_id": thread_id}})
    if found is None:
        raise RuntimeError("the paused run has no checkpoint")
    writes = [[task, channel, *_pack(SERDE.dumps_typed(value))]
              for task, channel, value in found.pending_writes or []]
    return json.dumps(
        {
            "format": FORMAT,
            "checkpoint": _pack(SERDE.dumps_typed(found.checkpoint)),
            "metadata": _pack(SERDE.dumps_typed(found.metadata)),
            "writes": writes,
        }
    )


async def restore(state: str, thread_id: str) -> InMemorySaver:
    """A saver holding the checkpoint `state` for `thread_id`. Raises `resume_failed` when
    `state` was not made by `save` of this format."""
    try:
        saved = json.loads(state)
        if saved.get("format") != FORMAT:
            raise ValueError(f"format {saved.get('format')!r}")
        checkpoint = _unpack(saved["checkpoint"])
        metadata = _unpack(saved["metadata"])
        saver = new_saver()
        config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
        stored = await saver.aput(config, checkpoint, metadata, checkpoint["channel_versions"])
        by_task: dict[str, list[tuple[str, Any]]] = {}
        for task, channel, kind, data in saved["writes"]:
            by_task.setdefault(task, []).append((channel, _unpack([kind, data])))
        for task, writes in by_task.items():
            await saver.aput_writes(stored, writes, task)
    except TraitError:
        raise
    except Exception as error:
        raise TraitError(
            "resume_failed",
            "This reply's saved progress could not be read. Send your message again.",
        ) from error
    return saver
