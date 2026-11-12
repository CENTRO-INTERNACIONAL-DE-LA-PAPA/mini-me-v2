"""The adapter interface; a Trait's definition comes from the core with each call."""

import sys
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, ClassVar

from mini_me_sidecar.context import CallContext, Model, TraitError
from mini_me_sidecar.tools.base import ToolError

TEXT_INPUT: dict[str, Any] = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
}

# Errors with which the core refuses a component; the reply then falls back to its text.
COMPONENT_REFUSED = {"component_not_allowed", "invalid_component"}


@dataclass(frozen=True)
class AdapterInfo:
    """What discovery reports; `providers` are those the adapter may request secrets for."""

    id: str
    description: str
    input_schema: dict[str, Any]
    providers: tuple[str, ...] = field(default=())

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "description": self.description,
            "input_schema": self.input_schema,
            "providers": list(self.providers),
        }


class Adapter(ABC):
    info: ClassVar[AdapterInfo]
    # Tools the adapter's own code uses; one that offers tools to a model reads each Trait's.
    uses_tools: ClassVar[tuple[str, ...]] = ()

    @abstractmethod
    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        """Produces the reply through `ctx`. Returning ends the call as done (or cancelled,
        if `ctx.cancelled` is set); raising ends it as an error."""


def require_model(ctx: CallContext) -> Model:
    model = ctx.model
    if model is None or not model.model:
        raise TraitError("model_not_set", "Choose an AI model in Settings first.")
    return model


async def component_or_text(
    ctx: CallContext,
    show: Callable[[CallContext, Any, str], Awaitable[str]],
    data: Any,
    text: str,
    label: str,
) -> None:
    """Shows `data` with `show`, or writes `text` when the core refuses the component."""
    try:
        await show(ctx, data, text)
    except ToolError as error:
        if error.code not in COMPONENT_REFUSED:
            raise
        print(f"[{label}] component refused: {error}", file=sys.stderr, flush=True)
        ctx.write("\n\n" + text)
