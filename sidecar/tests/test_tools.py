import asyncio
import inspect
import json

import pandas as pd
import pytest

from mini_me_sidecar.adapters.data.tables import Table
from mini_me_sidecar.adapters.prompt import _run_tool
from mini_me_sidecar.tools import DEFAULT_TOOLS, MODEL_TOOL_NAMES, tables
from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.components import read_component, show_results
from mini_me_sidecar.tools.files import READ_CHARS, check_file, read_file, save_file, text_result
from mini_me_sidecar.tools.model import MODEL_TOOLS, ModelTool
from mini_me_sidecar.tools.tables import (
    check_table,
    csv_name,
    given_table,
    show_frame,
    show_table,
    table_result,
)

COLUMNS = [{"name": "variety", "type": "text"}, {"name": "yield", "type": "number"}]


def test_a_text_file_gets_the_media_type_of_its_extension():
    assert check_file("sample.csv", "a,b\n1,2\n") == ("text/csv", b"a,b\n1,2\n")


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


def test_given_rows_become_table_data():
    check_table(COLUMNS, [["Yungay", 22.5], ["Canchan", None]])
    data = given_table("Yields", COLUMNS, [["Yungay", 22.5]])
    assert data == {"columns": COLUMNS, "rows": [["Yungay", 22.5]], "title": "Yields"}


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


def test_a_long_text_is_read_in_parts():
    text = "a" * (READ_CHARS + 10)
    first = text_result(text, 0)
    assert (len(first["content"]), first["total_characters"], first["more"]) == (
        READ_CHARS,
        READ_CHARS + 10,
        True,
    )
    rest = text_result(text, READ_CHARS)
    assert (len(rest["content"]), rest["more"]) == (10, False)


def test_a_table_read_gives_its_description_and_a_sample_and_rows_only_when_asked():
    table = Table("trial.csv", pd.DataFrame({"plot": range(1200), "yield": [1.5] * 1200}))
    sample = table_result(table, 0)
    assert sample["description"]["rows"] == 1200 and "show_table" in sample["note"]
    assert len(sample["csv"].splitlines()) == 21 and sample["more"]
    assert "columns" not in sample

    part = table_result(table, 500, 600)
    assert part["csv"].splitlines()[1] == "500,1.5"
    assert len(part["csv"].splitlines()) == 501
    assert (part["total_rows"], part["more"]) == (1200, True)
    assert part["columns"] == [{"name": "plot", "type": "number"}, {"name": "yield", "type": "number"}]
    assert "description" not in part


class ReadingContext:
    """Serves one text file and counts how often it is read."""

    def __init__(self) -> None:
        self.reads: dict = {}
        self.fetched = 0

    def progress(self, label: str) -> None:
        pass

    async def results(self) -> dict:
        return {"assets": [{"id": "a1", "name": "notes.txt"}]}

    async def read_asset(self, asset_id: str) -> bytes:
        self.fetched += 1
        return b"late blight " * 10_000


def test_a_file_read_in_parts_is_fetched_once_per_call():
    ctx = ReadingContext()
    first = asyncio.run(read_file(ctx, "a1"))
    rest = asyncio.run(read_file(ctx, "a1", READ_CHARS))
    assert first["more"] and not rest["more"]
    assert ctx.fetched == 1


def test_model_tools_are_known_and_their_schemas_match_their_functions():
    assert set(MODEL_TOOLS) == set(DEFAULT_TOOLS) | set(MODEL_TOOL_NAMES)
    for tool in MODEL_TOOLS.values():
        assert tool.parameters["type"] == "object"
        properties = set(tool.parameters["properties"])
        assert set(tool.parameters.get("required", [])) <= properties
        arguments = set(inspect.signature(tool.run).parameters) - {"ctx"}
        assert properties == arguments, tool.name


class ComponentContext:
    """Serves one component and records the files and components a call adds."""

    def __init__(self, component: dict | None = None) -> None:
        self.served = component or {}
        self.written: list[tuple[str, bool]] = []
        self.added: list[dict] = []

    def progress(self, label: str) -> None:
        pass

    async def read_component(self, component_id: str) -> dict:
        return self.served

    async def write_asset(self, name, media_type, data, hidden=False) -> dict:
        self.written.append((name, hidden))
        return {"id": f"asset-{len(self.written)}", "name": name}

    async def component(self, kind, version, preview, text, source_asset_id) -> str:
        self.added.append({"kind": kind, "preview": preview, "source": source_asset_id})
        return "c1"


def test_a_component_is_read_as_its_text_and_source_file():
    table = {"kind": "table", "version": 1, "text": "plot\tyield", "source_asset_id": "a1"}
    result = asyncio.run(read_component(ComponentContext(table), "c1"))
    assert result["source_asset_id"] == "a1" and "read_file" in result["note"]
    approval = {"kind": "approval", "version": 1, "text": "Go on?", "source_asset_id": None}
    result = asyncio.run(read_component(ComponentContext(approval), "c1"))
    assert result == {"kind": "approval", "text": "Go on?"}


def test_save_file_hides_a_file_only_when_asked():
    ctx = ComponentContext()
    asyncio.run(save_file(ctx, "trial.csv", "text/csv", b"a"))
    asyncio.run(save_file(ctx, "papers.json", "application/json", b"[]", hidden=True))
    assert ctx.written == [("trial.csv", False), ("papers.json", True)]


def test_a_shown_table_or_result_is_saved_as_its_source_file_first():
    ctx = ComponentContext()
    rows = [["Yungay", 22.5]]
    asyncio.run(show_table(ctx, "Sample yields", COLUMNS, rows))
    asyncio.run(show_frame(ctx, pd.DataFrame({"a": [1]}), "Columns", results_name="t-profile.csv"))
    asyncio.run(show_results(ctx, "paper-sources", "papers.json", [], {"papers": []}, "none"))
    assert ctx.written == [
        ("Sample yields.csv", False),
        ("t-profile.csv", True),
        ("papers.json", True),
    ]
    assert [c["source"] for c in ctx.added] == ["asset-1", "asset-2", "asset-3"]
    assert ctx.added[0]["preview"]["source"] == "Sample yields.csv"
    assert "source" not in ctx.added[1]["preview"]


def test_a_table_file_is_named_after_its_title():
    names = [csv_name(t) for t in ("Yields", "trial.xlsx", 'a/b: "c"', "", None)]
    assert names == ["Yields.csv", "trial.csv", "a-b- -c-.csv", "Table.csv", "Table.csv"]


def test_a_table_read_from_a_file_carries_the_file(monkeypatch):
    async def parse(ctx, function, name, data, text):
        return Table(name, pd.DataFrame({"plot": [1]}))

    monkeypatch.setattr(tables.WORKERS, "run", parse)
    ctx = ReadingContext()
    table = asyncio.run(tables.read_table(ctx, "a1", "trial.csv"))
    assert (table.name, table.source_id) == ("trial.csv", "a1")


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


def test_a_whole_float_argument_becomes_an_int():
    assert asyncio.run(ECHO.call(None, {"value": 3.0})) == {"value": 3}
    with pytest.raises(ToolError, match="whole number"):
        asyncio.run(ECHO.call(None, {"value": 2.5}))


def test_wrong_arguments_and_faults_in_a_tool_are_told_apart():
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
