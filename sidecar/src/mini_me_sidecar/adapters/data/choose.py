"""Asks the AI model to fill one of the catalogue's schemas from the user's message and the
description of their tables."""

import json
from typing import Any, TypeVar

from pydantic import BaseModel

from mini_me_sidecar.adapters.providers import chat_model, log_error, provider_error
from mini_me_sidecar.context import CallContext, TraitError

Plan = TypeVar("Plan", bound=BaseModel)


async def choose(
    ctx: CallContext, schema: type[Plan], text: str, descriptions: list[dict[str, Any]]
) -> Plan:
    model = ctx.model
    if model is None or not model.model:
        raise TraitError("model_not_set", "Choose an AI model in Settings first.")
    key = await ctx.secret(model.provider)
    material = (
        f"The user's message:\n{text}\n\nThe tables, described without their rows:\n"
        + json.dumps(descriptions, ensure_ascii=False, indent=1, default=str)
    )
    turns = [("system", ctx.trait.instructions or ""), ("human", material)]
    try:
        # Tool calling works with every provider and with OpenRouter's models; the default
        # for OpenAI's client, a `json_schema` response format, is refused by many of them.
        chat = chat_model(model, key.reveal()).with_structured_output(
            schema, method="function_calling"
        )
        answer = await chat.ainvoke(turns)
    except TraitError:
        raise
    except Exception as error:
        log_error(error, model, key.reveal())
        raise provider_error(error, model) from None
    if not isinstance(answer, schema):
        raise TraitError(
            "provider_empty",
            f"{model.model} gave no usable answer. Try again, or choose another model in "
            "Settings.",
        )
    return answer
