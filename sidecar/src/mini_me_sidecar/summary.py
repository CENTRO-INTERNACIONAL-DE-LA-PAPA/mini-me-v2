"""Short texts written from one piece of material by one model call: the Project Overview's
summary of its Conversations, and a Conversation's title from its first message. Each
`summary.start` gets exactly one `summary.done` or `summary.error`."""

import asyncio
import sys
import traceback
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from mini_me_sidecar.adapters.prompt import REFUSED, RESEARCH_CONTEXT
from mini_me_sidecar.adapters.providers import (
    PROVIDER_NAMES,
    chat_model,
    provider_error,
    structured_answer,
)
from mini_me_sidecar.context import Model, Requests, TraitError
from mini_me_sidecar.link import Link, log

SUMMARY_RULE = (
    "You write the summary at the top of a research Project's Overview. The user's message "
    "holds the Project's Conversations, newest first. Write 2 or 3 short sentences, at most 60 "
    "words in all: first the main findings so far, then what is still open or waiting for the "
    "user. Give results, not a history: do not retell the Conversations or say which Mini-Me "
    "did what. Plain prose only, with no title, list or formatting, except that each file, "
    "table or chart you name goes in square brackets followed by (), with its name exactly as "
    "the Conversations write it, such as [field-trial.csv](). Use only what the Conversations "
    "say, never invent results, numbers or references, and write in the language of the "
    "Conversations."
)


TITLE_RULE = (
    "You name a Conversation of a research Project. The user's message is the first message of "
    "the Conversation. Write a brief title: a label for its one main subject, "
    "about the length of a heading and not a sentence, that fits on one line of a sidebar. Name "
    "the subject and what is done with it, without listing several points or explaining. Use "
    "your own words: do not copy the message, and do not use text the user wants worked on, "
    "such as a sentence to translate or a quotation, as the title. Write the title in the "
    "language the user writes their request in. Plain text only: no quotes, no full stop, no "
    "formatting."
)

# The longest title kept, in characters. A longer one is cut at a word, never in the middle of one.
MAX_TITLE_CHARS = 60


def system_prompt(kind: str = "overview") -> str:
    """Who the model works for, then how to write the summary or the title."""
    return f"{RESEARCH_CONTEXT} {TITLE_RULE if kind == 'title' else SUMMARY_RULE}"


def clean_title(text: str) -> str:
    """The first line of a model's `text` as a title: without surrounding quotes, a closing full
    stop or extra spaces, and if longer than `MAX_TITLE_CHARS`, cut after a whole word."""
    line = next((l for l in text.strip().splitlines() if l.strip()), "")
    line = line.strip().strip("\"'“”‘’«»`*#").strip().rstrip(".").strip()
    if len(line) > MAX_TITLE_CHARS:
        cut = line[:MAX_TITLE_CHARS]
        # Back to the last whole word, unless the first word alone is longer than the limit.
        line = cut[: cut.rfind(" ")] if line[MAX_TITLE_CHARS] != " " and " " in cut else cut
        line = line.rstrip(" ,;:-–—")
    return line


class ModelTest(BaseModel):
    """The one tool a model test offers."""

    ok: bool = Field(description="Always true.")


async def _test_model(chat: Any, model: Model) -> str:
    """"ok" when `model` calls the tool it is offered, which Mini-Mes need of every model;
    otherwise raises why it did not."""
    turns = [("system", "Call the tool you are given."), ("human", "Call it now with ok true.")]
    if not isinstance(await structured_answer(chat, ModelTest, turns), ModelTest):
        raise TraitError(
            "tools_unsupported",
            f"{model.model} did not call the tool it was offered, which Mini-Mes need. Choose "
            "another model in Settings.",
        )
    return "ok"


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
        kind = frame.get("kind") if frame.get("kind") in ("title", "test") else "overview"
        try:
            text = await self._write(summary_id, model, str(frame.get("material") or ""), kind)
        except TraitError as error:
            self._error(summary_id, error.code, str(error))
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            mapped = provider_error(error, model) if model.provider in PROVIDER_NAMES else None
            if mapped:
                self._error(summary_id, mapped.code, str(mapped))
            else:
                failed = {
                    "title": "The title could not be written.",
                    "test": "The model could not be tested.",
                }.get(kind, "The summary could not be written.")
                self._error(summary_id, "summary_failed", failed)
        else:
            self._link.send({"type": "summary.done", "summary_id": summary_id, "text": text})

    async def _write(self, summary_id: str, model: Model, material: str, kind: str) -> str:
        key = await self._requests.send(summary_id, "secret.get", {"provider": model.provider})
        chat = chat_model(model, key["value"])
        if kind == "test":
            return await _test_model(chat, model)
        reply = await chat.ainvoke([SystemMessage(system_prompt(kind)), HumanMessage(material)])
        ending = getattr(reply, "response_metadata", None) or {}
        name = PROVIDER_NAMES[model.provider]
        if ending.get("finish_reason") in REFUSED or ending.get("stop_reason") in REFUSED:
            raise TraitError(
                "provider_refused",
                f"{model.model} declined to write the summary: {name}'s content filter stopped "
                "it. Choose another model in Settings.",
            )
        text = str(reply.text).strip()
        if kind == "title":
            text = clean_title(text)
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
