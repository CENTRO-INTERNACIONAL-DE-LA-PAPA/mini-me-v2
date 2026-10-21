import asyncio
import inspect

import pandas as pd
import pytest

from mini_me_sidecar.tools import MODEL_TOOL_NAMES, READ_TOOLS, TOOL_NAMES
from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.components import component_result
from mini_me_sidecar.tools.files import READ_CHARS, check_file, read_file, text_result
from mini_me_sidecar.tools.model import MODEL_TOOLS
from mini_me_sidecar.tools.tables import check_table, given_table, table_result

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


def test_a_table_is_read_from_a_start_row():
    frame = pd.DataFrame({"plot": range(1200), "yield": [1.5] * 1200})
    part = table_result(frame, 500)
    assert part["csv"].splitlines()[1] == "500,1.5"
    assert len(part["csv"].splitlines()) == 501
    assert (part["total_rows"], part["more"]) == (1200, True)
    assert part["columns"] == [{"name": "plot", "type": "number"}, {"name": "yield", "type": "number"}]


def test_a_table_component_is_read_with_all_its_rows():
    data = {"columns": COLUMNS, "rows": [["Yungay", 22.5]] * 120, "title": "Yields"}
    result = component_result({"kind": "table", "data": data})
    assert result["rows_in_component"] == result["total_rows"] == 120
    assert result["csv"].splitlines()[:2] == ["variety,yield", "Yungay,22.5"]
    assert result["more"] is False
    other = component_result({"kind": "theories", "data": {"theories": []}})
    assert other == {
        "kind": "theories",
        "start": 0,
        "total_characters": 16,
        "more": False,
        "data": '{"theories": []}',
    }


def test_a_long_table_component_is_read_in_whole_rows():
    rows = [["Yungay", "x" * 1000]] * 150
    data = {"columns": COLUMNS, "rows": rows}
    first = component_result({"kind": "table", "data": data})
    shown = len(first["csv"].splitlines()) - 1
    assert first["more"] is True and 0 < shown < 150
    assert len(first["csv"]) <= READ_CHARS
    rest = component_result({"kind": "table", "data": data}, shown)
    assert rest["more"] is False
    assert shown + len(rest["csv"].splitlines()) - 1 == 150


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
    assert set(MODEL_TOOLS) == set(READ_TOOLS) | set(MODEL_TOOL_NAMES)
    assert set(MODEL_TOOLS) <= set(TOOL_NAMES)
    for tool in MODEL_TOOLS.values():
        assert tool.parameters["type"] == "object"
        properties = set(tool.parameters["properties"])
        assert set(tool.parameters.get("required", [])) <= properties
        arguments = set(inspect.signature(tool.run).parameters) - {"ctx"}
        assert properties == arguments, tool.name
