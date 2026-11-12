"""Asks the model to fill a catalogue schema from the message and the tables' descriptions."""

import json
from typing import Any, TypeVar

from pydantic import BaseModel

from mini_me_sidecar.adapters.base import require_model
from mini_me_sidecar.adapters.providers import ask_structured
from mini_me_sidecar.context import CallContext, TraitError

Plan = TypeVar("Plan", bound=BaseModel)


async def choose(
    ctx: CallContext, schema: type[Plan], text: str, descriptions: list[dict[str, Any]]
) -> Plan:
    model = require_model(ctx)
    material = (
        f"The user's message:\n{text}\n\nThe tables, described without their rows:\n"
        + json.dumps(descriptions, ensure_ascii=False, indent=1, default=str)
    )
    turns = [("system", ctx.trait.instructions or ""), ("human", material)]
    # Tool calling works with every provider and with OpenRouter's models; the default
    # for OpenAI's client, a `json_schema` response format, is refused by many of them.
    answer = await ask_structured(ctx, schema, turns)
    if not isinstance(answer, schema):
        raise TraitError(
            "provider_empty",
            f"{model.model} gave no usable answer. Try again, or choose another model in "
            "Settings.",
        )
    return answer
