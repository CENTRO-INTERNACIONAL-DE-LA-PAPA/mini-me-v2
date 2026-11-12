"""A condition's or loop's decision: the AI model chosen in Settings picks one answer from a
fixed list."""

import json
from typing import Any, Literal

from pydantic import BaseModel, Field, create_model

from mini_me_sidecar.adapters.base import require_model
from mini_me_sidecar.adapters.providers import ask_structured
from mini_me_sidecar.context import CallContext, TraitError

SYSTEM = (
    "You decide which path a Mini-Me's Workflow takes next. Read the user's message and the "
    "outputs of the Workflow's earlier Steps, then answer the question with exactly one of "
    "the allowed choices."
)


def decision_schema(choices: list[str]) -> type[BaseModel]:
    """A schema whose only field, `choice`, must be one of `choices`."""
    return create_model(
        "Decision",
        choice=(Literal[tuple(choices)], Field(description="One of the allowed choices.")),
    )


async def decide(
    ctx: CallContext,
    question: str,
    choices: list[str],
    message: str,
    earlier: list[dict[str, Any]],
) -> str:
    """The model's answer to `question`, one of `choices`. Raises `invalid_decision` when the
    model answers anything else."""
    model = require_model(ctx)
    material = "\n\n".join(
        [
            f"The user's message:\n{message}",
            *(f"--- {e['name']} ---\n{e['output']}" for e in earlier),
            f"Question: {question}\nAllowed choices: {json.dumps(choices, ensure_ascii=False)}",
        ]
    )
    turns = [("system", SYSTEM), ("human", material)]
    # Tool calling works with every provider and with OpenRouter's models.
    answer = await ask_structured(ctx, decision_schema(choices), turns, none_if_invalid=True)
    choice = getattr(answer, "choice", None)
    if choice not in choices:
        raise TraitError(
            "invalid_decision",
            f"{model.model} did not answer with one of {', '.join(choices)}. Try again, or "
            "choose another model in Settings.",
        )
    return str(choice)
