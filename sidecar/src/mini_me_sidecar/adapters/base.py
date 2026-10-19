"""The adapter interface. Every Trait, whatever its provider, is run by an `Adapter`: the
Trait's definition (its instructions) comes from the Rust core with each call."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar

from mini_me_sidecar.context import CallContext


@dataclass(frozen=True)
class AdapterInfo:
    """What discovery reports. `providers` are the provider IDs the adapter may request
    secrets for."""

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
    # The tools this adapter's own code uses; its Traits list the same ones. An adapter that
    # offers tools to a model instead takes them from each Trait's definition.
    uses_tools: ClassVar[tuple[str, ...]] = ()

    @abstractmethod
    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        """Produces the reply through `ctx`. Returning ends the call as done (or cancelled,
        if `ctx.cancelled` is set); raising ends it as an error."""
