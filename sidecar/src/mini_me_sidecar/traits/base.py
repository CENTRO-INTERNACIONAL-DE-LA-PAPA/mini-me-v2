"""The Trait adapter interface. Every Trait, whatever its provider, implements `Trait`."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar

from mini_me_sidecar.context import CallContext


@dataclass(frozen=True)
class TraitInfo:
    """What discovery reports. `name` is an imperative verb in Title Case; `providers` are
    the provider IDs the Trait may request secrets for."""

    id: str
    name: str
    description: str
    input_schema: dict[str, Any]
    providers: tuple[str, ...] = field(default=())

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "providers": list(self.providers),
        }


class Trait(ABC):
    info: ClassVar[TraitInfo]

    @abstractmethod
    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        """Produces the reply through `ctx`. Returning ends the call as done (or cancelled,
        if `ctx.cancelled` is set); raising ends it as an error."""
