"""A condition's or loop's decision: the AI model chosen in Settings picks one answer from a
fixed list."""

import json
from typing import Any, Callable, Literal

from pydantic import BaseModel, Field, ValidationError, create_model

from mini_me_sidecar.adapters.providers import chat_model, log_error, provider_error
from mini_me_sidecar.context import CallContext, Model, TraitError

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
    make_chat: Callable[[Model, str], Any] = chat_model,
) -> str:
    """The model's answer to `question`, one of `choices`. Raises `invalid_decision` when the
    model answers anything else."""
    model = ctx.model
    if model is None or not model.model:
        raise TraitError("model_not_set", "Choose an AI model in Settings first.")
    key = await ctx.secret(model.provider)
    material = "\n\n".join(
        [
            f"The user's message:\n{message}",
            *(f"--- {e['name']} ---\n{e['output']}" for e in earlier),
            f"Question: {question}\nAllowed choices: {json.dumps(choices, ensure_ascii=False)}",
        ]
    )
    schema = decision_schema(choices)
    try:
        # Tool calling works with every provider and with OpenRouter's models.
        chat = make_chat(model, key.reveal()).with_structured_output(
            schema, method="function_calling"
        )
        answer = await chat.ainvoke([("system", SYSTEM), ("human", material)])
    except TraitError:
        raise
    except ValidationError:
        # The model answered with something outside the allowed choices.
        answer = None
    except Exception as error:
        log_error(error, model, key.reveal())
        raise provider_error(error, model) from None
    choice = getattr(answer, "choice", None)
    if choice not in choices:
        raise TraitError(
            "invalid_decision",
            f"{model.model} did not answer with one of {', '.join(choices)}. Try again, or "
            "choose another model in Settings.",
        )
    return str(choice)
