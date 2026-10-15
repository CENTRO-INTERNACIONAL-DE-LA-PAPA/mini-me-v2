"""Routing decisions from Typesafe's Jev: which Mini-Me answers a message, whether it reacts,
and whether the message needs earlier context. Each `route.start` gets exactly one
`route.done` or `route.error`."""

import asyncio
import sys
import traceback
from typing import Any

from mini_me_sidecar.context import CoreRequestError, Requests
from mini_me_sidecar.link import Link, log

JEV_MODEL = "jev-latest"

# Shorter than the core's wait for a decision, so a slow answer still arrives in time.
JEV_TIMEOUT_S = 8.0

REACTIONS = {
    "none": "Most messages: the user is asking for something or stating facts",
    "👍": "The user thanks the assistant or agrees with something",
    "🎉": "The user celebrates a success, a result or a milestone",
    "💛": "The user expresses warm appreciation",
    "😄": "The user expresses happiness or excitement",
    "😡": "The user expresses anger or frustration",
    "😢": "The user expresses sadness or disappointment",
    "🥔": "The message contains the word 'potato' or 'solanum"
}

NEEDS_CONTEXT = {
    "yes": "The message refers to earlier messages, for example 'it', 'that', 'again', "
    "'shorter' or a follow-up question that is unclear on its own",
    "no": "The message can be understood on its own",
}


class Router:
    def __init__(self, link: Link, requests: Requests) -> None:
        self._link = link
        self._requests = requests
        self._tasks: set[asyncio.Task[None]] = set()

    def start(self, frame: dict[str, Any]) -> None:
        route_id = frame.get("route_id")
        if not isinstance(route_id, str):
            log(f"ignoring route.start without a route_id: {frame!r}")
            return
        task = asyncio.create_task(self._route(route_id, frame))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _route(self, route_id: str, frame: dict[str, Any]) -> None:
        try:
            answers = await self._ask(route_id, frame)
        except CoreRequestError as error:
            self._error(route_id, error.code, str(error))
        except Exception:
            traceback.print_exc(file=sys.stderr)
            self._error(route_id, "jev_unavailable", "Typesafe could not be reached.")
        else:
            self._link.send({"type": "route.done", "route_id": route_id, "answers": answers})

    async def _ask(self, route_id: str, frame: dict[str, Any]) -> dict[str, Any]:
        key = await self._requests.send(route_id, "secret.get", {"provider": "typesafe"})
        from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy

        questions = _questions(frame.get("ask") or [], frame.get("mini_mes") or [])
        async with AsyncTypeSafeClient(
            api_key=key["value"],
            model=JEV_MODEL,
            timeout=JEV_TIMEOUT_S,
            retry=RetryPolicy(max_retries=0),
        ) as client:
            response = await client.system_one(state=frame.get("state") or {}, questions=questions)
        return {
            name: {
                "choice": answer.choice,
                "confidence": answer.confidence,
                "probabilities": dict(answer.probabilities),
            }
            for name, answer in response.choices.items()
        }

    def _error(self, route_id: str, code: str, message: str) -> None:
        error = {"code": code, "message": message}
        self._link.send({"type": "route.error", "route_id": route_id, "error": error})

    async def close(self) -> None:
        for task in list(self._tasks):
            task.cancel()


def _questions(ask: list[str], mini_mes: list[dict[str, Any]]) -> dict[str, Any]:
    from typesafe_sdk import Choice

    available = {
        "mini_me": lambda: Choice(
            instructions="Which assistant should answer the user's message?",
            criteria={
                str(m.get("id")): f"{m.get('name')}: {m.get('description')}" for m in mini_mes
            },
        ),
        "reaction": lambda: Choice(
            instructions="Should the assistant react to the user's message with an emoji?",
            criteria=REACTIONS,
        ),
        "needs_context": lambda: Choice(
            instructions="Does answering this message need the earlier messages of the "
            "conversation?",
            criteria=NEEDS_CONTEXT,
        ),
    }
    return {name: available[name]() for name in ask if name in available}
