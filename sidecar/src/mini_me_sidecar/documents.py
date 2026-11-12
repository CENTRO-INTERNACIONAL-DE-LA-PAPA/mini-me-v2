"""Drafts a report from a Conversation, streamed, outside any reply. Each request gets exactly one
ending frame; nothing touches disk."""

import asyncio
import sys
import traceback
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from mini_me_sidecar.adapters.prompt import REFUSED, RESEARCH_CONTEXT
from mini_me_sidecar.adapters.providers import PROVIDER_NAMES, chat_model, provider_error
from mini_me_sidecar.context import Model, Requests, TraitError
from mini_me_sidecar.link import Link, log

DRAFT_RULE = (
    "You are Scribe, and you draft a report for the user from one Conversation of their "
    "research Project. The user's message gives the report's title, then the Conversation's "
    "messages, oldest first, each with who wrote it. Write the report's body in Markdown: "
    "start with a short summary under the heading '# Summary', then one '#' section per topic "
    "the Conversation covered, with '##' subsections, lists and tables where they help. Keep "
    "the findings, numbers, methods and open questions; say which Mini-Me found or proposed "
    "something when that matters. Do not write a title or a YAML header, and do not retell the "
    "Conversation turn by turn. Use only what the Conversation says, never invent results, "
    "numbers or references, and write in the language of the Conversation."
)


def draft_prompt() -> str:
    return f"{RESEARCH_CONTEXT} {DRAFT_RULE}"


class Documents:
    def __init__(self, link: Link, requests: Requests) -> None:
        self._link = link
        self._requests = requests
        self._tasks: set[asyncio.Task[None]] = set()
        self._drafts: dict[str, asyncio.Task[None]] = {}

    def _spawn(self, work: Any) -> asyncio.Task[None]:
        task = asyncio.create_task(work)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    def start_draft(self, frame: dict[str, Any]) -> None:
        draft_id = frame.get("draft_id")
        if not isinstance(draft_id, str):
            log(f"ignoring draft.start without a draft_id: {frame!r}")
            return
        task = self._spawn(self._draft(draft_id, frame))
        self._drafts[draft_id] = task

        def ended(task: asyncio.Task[None]) -> None:
            self._drafts.pop(draft_id, None)
            # Only a draft cancelled before `_draft` began ends here; `_draft` ends the others.
            if task.cancelled():
                self._link.send({"type": "draft.done", "draft_id": draft_id})

        task.add_done_callback(ended)

    def cancel_draft(self, draft_id: Any) -> None:
        task = self._drafts.get(draft_id) if isinstance(draft_id, str) else None
        if task is not None:
            task.cancel()

    async def _draft(self, draft_id: str, frame: dict[str, Any]) -> None:
        raw = frame.get("model") or {}
        model = Model(provider=str(raw.get("provider", "")), model=str(raw.get("model", "")))
        title = str(frame.get("title") or "")
        material = str(frame.get("material") or "")
        try:
            await self._write_draft(draft_id, model, title, material)
        except asyncio.CancelledError:
            # A stopped draft ends normally: the core keeps what was written.
            self._link.send({"type": "draft.done", "draft_id": draft_id})
        except TraitError as error:
            self._draft_error(draft_id, error.code, str(error))
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            mapped = provider_error(error, model) if model.provider in PROVIDER_NAMES else None
            if mapped:
                self._draft_error(draft_id, mapped.code, str(mapped))
            else:
                self._draft_error(draft_id, "draft_failed", "The draft could not be written.")
        else:
            self._link.send({"type": "draft.done", "draft_id": draft_id})

    async def _write_draft(self, draft_id: str, model: Model, title: str, material: str) -> None:
        key = await self._requests.send(draft_id, "secret.get", {"provider": model.provider})
        chat = chat_model(model, key["value"])
        messages = [SystemMessage(draft_prompt()), HumanMessage(f"Title: {title}\n\n{material}")]
        wrote = False
        async for chunk in chat.astream(messages):
            metadata = getattr(chunk, "response_metadata", None) or {}
            if metadata.get("finish_reason") in REFUSED or metadata.get("stop_reason") in REFUSED:
                raise TraitError(
                    "provider_refused",
                    f"{model.model} stopped the draft: {PROVIDER_NAMES[model.provider]}'s content "
                    "filter stopped it. Choose another model in Settings.",
                )
            if text := str(chunk.text):
                self._link.send({"type": "draft.delta", "draft_id": draft_id, "text": text})
                wrote = True
        if not wrote:
            raise TraitError(
                "provider_empty",
                f"{PROVIDER_NAMES[model.provider]} sent an empty draft. Try again, or choose "
                "another model in Settings.",
            )

    def _draft_error(self, draft_id: str, code: str, message: str) -> None:
        error = {"code": code, "message": message}
        self._link.send({"type": "draft.error", "draft_id": draft_id, "error": error})

    async def close(self) -> None:
        for task in list(self._tasks):
            task.cancel()
