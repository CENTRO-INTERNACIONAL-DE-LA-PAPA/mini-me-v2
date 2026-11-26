import asyncio
import inspect
import json

import pytest

from mini_me_sidecar.adapters.prompt import _run_tool
from mini_me_sidecar.tools import DEFAULT_TOOLS, MODEL_TOOL_NAMES
from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.files import check_file
from mini_me_sidecar.tools.model import MODEL_TOOLS, ModelTool
from mini_me_sidecar.tools.tables import check_table

COLUMNS = [{"name": "variety", "type": "text"}, {"name": "yield", "type": "number"}]


@pytest.mark.parametrize(
    "name, content",
    [
        ("report.xlsx", "x"),
        ("data/sample.csv", "x"),
        ("notes.json", "{oops"),
        ("big.txt", "x" * (2 * 1024 * 1024 + 1)),
    ],
)
def test_a_text_file_a_model_cannot_save(name, content):
    with pytest.raises(ToolError):
        check_file(name, content)


@pytest.mark.parametrize(
    "columns, rows",
    [
        (COLUMNS, [["Yungay"]]),
        (COLUMNS, [["Yungay", "12 kg"]]),
        (COLUMNS, [["Yungay", 10**400]]),
        (COLUMNS, [["Yungay", 1.0]] * 501),
        ([{"name": "when", "type": "date"}], [["March"]]),
        ([{"name": "x", "type": "colour"}], []),
    ],
)
def test_rows_a_table_cannot_hold(columns, rows):
    with pytest.raises(ToolError):
        check_table(columns, rows)


def test_model_tools_are_known_and_their_schemas_match_their_functions():
    assert set(MODEL_TOOLS) == set(DEFAULT_TOOLS) | set(MODEL_TOOL_NAMES)
    for tool in MODEL_TOOLS.values():
        assert tool.parameters["type"] == "object"
        properties = set(tool.parameters["properties"])
        assert set(tool.parameters.get("required", [])) <= properties
        arguments = set(inspect.signature(tool.run).parameters) - {"ctx"}
        assert properties == arguments, tool.name


async def echo(ctx, value: int = 0) -> dict:
    return {"value": value}


async def broken(ctx) -> dict:
    raise RuntimeError("a fault in the tool")


ECHO = ModelTool(
    name="echo",
    description="",
    parameters={"type": "object", "properties": {"value": {"type": "integer"}}},
    run=echo,
)


def test_wrong_arguments_and_faults_in_a_tool_are_told_apart():
    assert asyncio.run(ECHO.call(None, {"value": 3.0})) == {"value": 3}
    with pytest.raises(ToolError):
        asyncio.run(ECHO.call(None, {"value": 2.5}))

    needs = ModelTool(
        name="needs",
        description="",
        parameters={"type": "object", "properties": {"value": {"type": "string"}}},
        run=lambda ctx, value: echo(ctx, value),
    )
    fails = ModelTool(
        name="fails", description="", parameters={"type": "object", "properties": {}}, run=broken
    )
    offered = {"needs": needs, "fails": fails}
    wrong = asyncio.run(_run_tool(None, offered, {"name": "needs", "args": {}}))
    fault = asyncio.run(_run_tool(None, offered, {"name": "fails", "args": {}}))
    assert json.loads(wrong)["error"] and json.loads(fault)["error"]
    assert json.loads(wrong)["error"] != json.loads(fault)["error"]
