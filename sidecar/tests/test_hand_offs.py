import asyncio

import pytest

from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.hand_offs import hand_off

MINI_MES = [
    {"id": "m-profiler", "name": "Profiler", "description": "Describes a data table"},
    {"id": "m-plotter", "name": "Plotter", "description": "Draws charts of a data table"},
]


class FakeContext:
    mini_mes = MINI_MES

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str | None]] = []

    async def hand_off(self, mini_me_id: str, request: str, asset_id: str | None) -> None:
        self.sent.append((mini_me_id, request, asset_id))


def test_a_name_is_handed_off_by_its_id():
    ctx = FakeContext()
    result = asyncio.run(hand_off(ctx, "Profiler", " profile it ", "a1"))
    assert result["handed_to"] == "Profiler"
    assert "Don't repeat" in result["next"]
    assert ctx.sent == [("m-profiler", "profile it", "a1")]
    with pytest.raises(ToolError, match="Profiler, Plotter"):
        asyncio.run(hand_off(ctx, "Theorist", "build a theory"))
