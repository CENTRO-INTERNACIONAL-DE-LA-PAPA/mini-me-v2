"""Asks Typesafe's Jev which Mini-Me answers, how it reacts, whether earlier context is needed
and which file is meant. Each `route.start` gets exactly one `route.done` or `route.error`."""

import asyncio
import sys
import traceback
from typing import Any

from typesafe_sdk import AsyncTypeSafeClient, Choice, RetryPolicy

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
    "🥔": "The message contains the word 'potato' or 'solanum'",
    "🤔": "The user is puzzled by a result or unsure whether something is right",
    "😮": "The user is surprised by a result",
    "💪": "The user is determined, or encourages the assistant to keep going",
    "🌱": "The message is about planting, seedlings, sprouting or the start of a field season",
    "😅": "The user admits a mistake or laughs at a setback",
    "🙏": "The user apologizes or asks for patience",
    "☕": "The user mentions a break, coffee or a long day",
    "🧪": "The message is about running an experiment or lab work",
    "🌧️": "The message is about rain, drought or weather affecting the field",
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
        # For the core's debug record; None when failing before sending, as without a key.
        asked: dict[str, Any] | None = None
        try:
            key = await self._requests.send(route_id, "secret.get", {"provider": "typesafe"})
            state = frame.get("state") or {}
            questions = _questions(
                frame.get("ask") or [], frame.get("mini_mes") or [], frame.get("files") or []
            )
            asked = _asked(state, questions)
            answers = await self._ask(key["value"], state, questions)
        except CoreRequestError as error:
            self._error(route_id, error.code, str(error), asked)
        except Exception:
            traceback.print_exc(file=sys.stderr)
            self._error(route_id, "jev_unavailable", "Typesafe could not be reached.", asked)
        else:
            done = {"type": "route.done", "route_id": route_id, "answers": answers}
            self._link.send({**done, "asked": asked})

    async def _ask(
        self, api_key: str, state: dict[str, Any], questions: dict[str, Any]
    ) -> dict[str, Any]:
        async with AsyncTypeSafeClient(
            api_key=api_key,
            model=JEV_MODEL,
            timeout=JEV_TIMEOUT_S,
            retry=RetryPolicy(max_retries=0),
        ) as client:
            response = await client.system_one(state=state, questions=questions)
        return {
            name: {
                "choice": answer.choice,
                "confidence": answer.confidence,
                "probabilities": dict(answer.probabilities),
            }
            for name, answer in response.choices.items()
        }

    def _error(
        self, route_id: str, code: str, message: str, asked: dict[str, Any] | None
    ) -> None:
        error = {"code": code, "message": message}
        frame = {"type": "route.error", "route_id": route_id, "error": error, "asked": asked}
        self._link.send(frame)

    async def close(self) -> None:
        for task in list(self._tasks):
            task.cancel()


def _asked(state: dict[str, Any], questions: dict[str, Choice]) -> dict[str, Any]:
    """The request as the core's debug record shows it: state, instructions and option texts."""
    return {
        "state": state,
        "questions": {
            name: {"instructions": q.instructions, "options": dict(q.criteria)}
            for name, q in questions.items()
        },
    }


def _questions(
    ask: list[str], mini_mes: list[dict[str, Any]], files: list[dict[str, Any]]
) -> dict[str, Any]:
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
        "file": lambda: Choice(
            instructions="Which of the conversation's files does the user's message mean, "
            "directly or through a table or chart made from it?",
            criteria={
                **{str(f.get("id")): _file_criterion(f) for f in files},
                "none": "The message is not about one of these files",
            },
        ),
    }
    return {name: available[name]() for name in ask if name in available}


def _file_criterion(file: dict[str, Any]) -> str:
    """A `file` option, e.g. "The file trial.csv. Used by components: chart 'Yield', table 'T'"."""
    used = []
    for component in file.get("components") or []:
        title = component.get("title")
        kind = str(component.get("kind"))
        used.append(f"{kind} '{title}'" if title else kind)
    criterion = f"The file {file.get('name')}"
    if not used:
        return criterion
    return f"{criterion}. Used by components: {', '.join(used)}"
