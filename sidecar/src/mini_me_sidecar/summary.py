"""Project Overview summaries: one model call that summarises a Project's Conversations.
Each `summary.start` gets exactly one `summary.done` or `summary.error`."""

import asyncio
import sys
import traceback
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from mini_me_sidecar.adapters.prompt import REFUSED, RESEARCH_CONTEXT
from mini_me_sidecar.adapters.providers import PROVIDER_NAMES, chat_model, provider_error
from mini_me_sidecar.context import Model, Requests, TraitError
from mini_me_sidecar.link import Link, log

SUMMARY_RULE = (
    "You write the summary at the top of a research Project's Overview. The user's message "
    "holds the Project's Conversations, newest first. Write 2 or 3 short sentences, at most 60 "
    "words in all: first the main findings so far, then what is still open or waiting for the "
    "user. Give results, not a history: do not retell the Conversations or say which Mini-Me "
    "did what. Plain prose only, with no title, list or formatting. Use only what the "
    "Conversations say, never invent results, numbers or references, and write in the "
    "language of the Conversations."
)


def system_prompt() -> str:
    """Who the model works for, then how to write the summary."""
    return f"{RESEARCH_CONTEXT} {SUMMARY_RULE}"


class Summarizer:
    def __init__(self, link: Link, requests: Requests) -> None:
        self._link = link
        self._requests = requests
        self._tasks: set[asyncio.Task[None]] = set()

    def start(self, frame: dict[str, Any]) -> None:
        summary_id = frame.get("summary_id")
        if not isinstance(summary_id, str):
            log(f"ignoring summary.start without a summary_id: {frame!r}")
            return
        task = asyncio.create_task(self._summarize(summary_id, frame))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _summarize(self, summary_id: str, frame: dict[str, Any]) -> None:
        raw = frame.get("model") or {}
        model = Model(provider=str(raw.get("provider", "")), model=str(raw.get("model", "")))
        try:
            text = await self._write(summary_id, model, str(frame.get("material") or ""))
        except TraitError as error:
            self._error(summary_id, error.code, str(error))
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            mapped = provider_error(error, model) if model.provider in PROVIDER_NAMES else None
            if mapped:
                self._error(summary_id, mapped.code, str(mapped))
            else:
                self._error(summary_id, "summary_failed", "The summary could not be written.")
        else:
            self._link.send({"type": "summary.done", "summary_id": summary_id, "text": text})

    async def _write(self, summary_id: str, model: Model, material: str) -> str:
        key = await self._requests.send(summary_id, "secret.get", {"provider": model.provider})
        chat = chat_model(model, key["value"])
        reply = await chat.ainvoke([SystemMessage(system_prompt()), HumanMessage(material)])
        ending = getattr(reply, "response_metadata", None) or {}
        name = PROVIDER_NAMES[model.provider]
        if ending.get("finish_reason") in REFUSED or ending.get("stop_reason") in REFUSED:
            raise TraitError(
                "provider_refused",
                f"{model.model} declined to write the summary: {name}'s content filter stopped "
                "it. Choose another model in Settings.",
            )
        text = str(reply.text).strip()
        if not text:
            raise TraitError(
                "provider_empty",
                f"{name} sent an empty summary. Try again, or choose another model in Settings.",
            )
        return text

    def _error(self, summary_id: str, code: str, message: str) -> None:
        error = {"code": code, "message": message}
        self._link.send({"type": "summary.error", "summary_id": summary_id, "error": error})

    async def close(self) -> None:
        for task in list(self._tasks):
            task.cancel()
