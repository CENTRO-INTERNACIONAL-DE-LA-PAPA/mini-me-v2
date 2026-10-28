"""Showing Interactive Components other than tables, one tool per kind, and reading any of
the Conversation's components back. Tables are in `tools.tables`."""

import csv
import io
import json
from typing import Any

from mini_me_sidecar.context import CallContext, CoreRequestError
from mini_me_sidecar.tools.base import ToolError, add_component

# The most characters of a component's data one read returns.
READ_CHARS = 100_000


async def show_chart(ctx: CallContext, data: dict[str, Any], text: str) -> str:
    """Shows a `chart` component and returns its ID."""
    return await add_component(ctx, "chart", data, text)


async def show_papers(ctx: CallContext, data: dict[str, Any], text: str) -> str:
    """Shows a `paper-sources` component and returns its ID."""
    return await add_component(ctx, "paper-sources", data, text)


async def show_theories(ctx: CallContext, data: dict[str, Any], text: str) -> str:
    """Shows a `theories` component and returns its ID."""
    return await add_component(ctx, "theories", data, text)


async def read_component(ctx: CallContext, component_id: str, start: int = 0) -> dict[str, Any]:
    """Part of one of the Conversation's components, shaped for a model to read: a table's
    rows from row `start`, or another kind's data from character `start`."""
    if start < 0:
        raise ToolError("start cannot be negative.")
    ctx.progress("Reading a component")
    try:
        component = await ctx.read_component(component_id)
    except CoreRequestError as error:
        raise ToolError(
            f"No component with the ID {component_id} in this Conversation.", error.code
        ) from None
    return component_result(component, start)


def component_result(component: dict[str, Any], start: int = 0) -> dict[str, Any]:
    """A `table` component as its columns and whole rows from row `start` in CSV text; any
    other kind as its data in JSON from character `start`. Either holds at most `READ_CHARS`
    characters (a table at least one row), and `more` says whether more follow."""
    kind = str(component.get("kind", ""))
    data = component.get("data") or {}
    if kind == "table" and isinstance(data, dict):
        columns = data.get("columns") or []
        rows = data.get("rows") or []
        lines = [_csv_line([c.get("name") for c in columns])]
        size = len(lines[0])
        for row in rows[start:]:
            line = _csv_line(row)
            if len(lines) > 1 and size + len(line) > READ_CHARS:
                break
            lines.append(line)
            size += len(line)
        end = start + len(lines) - 1
        result: dict[str, Any] = {
            "kind": kind,
            "title": data.get("title"),
            "columns": columns,
            "start": start,
            "rows_in_component": len(rows),
            "total_rows": data.get("total_rows", len(rows)),
            "more": end < len(rows),
            "csv": "".join(lines),
        }
        if data.get("source"):
            # The file the table was shown from; for a preview, it holds the full table.
            result["source"] = data["source"]
        if component.get("source_asset_id"):
            result["source_asset_id"] = component["source_asset_id"]
        return result
    content = json.dumps(data, ensure_ascii=False)
    part = content[start : start + READ_CHARS]
    return {
        "kind": kind,
        "start": start,
        "total_characters": len(content),
        "more": start + len(part) < len(content),
        "data": part,
    }


def _csv_line(values: list[Any]) -> str:
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator="\n").writerow(values)
    return buffer.getvalue()
