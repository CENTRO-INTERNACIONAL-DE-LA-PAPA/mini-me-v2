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
    "name, content, message",
    [
        ("report.xlsx", "x", "Only CSV"),
        ("data/sample.csv", "x", "plain file name"),
        ("notes.json", "{oops", "not valid JSON"),
        ("big.txt", "x" * (2 * 1024 * 1024 + 1), "2 MiB"),
    ],
)
def test_a_text_file_a_model_cannot_save(name, content, message):
    with pytest.raises(ToolError, match=message):
        check_file(name, content)


@pytest.mark.parametrize(
    "columns, rows, message",
    [
        (COLUMNS, [["Yungay"]], "Row 1 has 1 values for 2 columns"),
        (COLUMNS, [["Yungay", "12 kg"]], "Row 1, column 'yield'"),
        (COLUMNS, [["Yungay", 10**400]], "Row 1, column 'yield'"),
        (COLUMNS, [["Yungay", 1.0]] * 501, "at most 500 rows"),
        ([{"name": "when", "type": "date"}], [["March"]], "not a date"),
        ([{"name": "x", "type": "colour"}], [], "needs a type"),
    ],
)
def test_rows_a_table_cannot_hold(columns, rows, message):
    with pytest.raises(ToolError, match=message):
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
    assert json.loads(wrong)["error"].startswith("Wrong arguments for needs")
    fault = asyncio.run(_run_tool(None, offered, {"name": "fails", "args": {}}))
    assert json.loads(fault) == {"error": "fails failed unexpectedly."}
