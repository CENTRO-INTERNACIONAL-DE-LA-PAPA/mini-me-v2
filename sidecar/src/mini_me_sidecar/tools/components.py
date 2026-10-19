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


async def read_component(ctx: CallContext, component_id: str) -> dict[str, Any]:
    """One of the Conversation's components, shaped for a model to read."""
    ctx.progress("Reading a component")
    try:
        component = await ctx.read_component(component_id)
    except CoreRequestError as error:
        raise ToolError(
            f"No component with the ID {component_id} in this Conversation.", error.code
        ) from None
    return component_result(component)


def component_result(component: dict[str, Any]) -> dict[str, Any]:
    """A `table` component as its columns and rows in CSV text; any other kind as its data in
    JSON, at most `READ_CHARS` characters."""
    kind = str(component.get("kind", ""))
    data = component.get("data") or {}
    if kind == "table" and isinstance(data, dict):
        columns = data.get("columns") or []
        rows = data.get("rows") or []
        buffer = io.StringIO()
        writer = csv.writer(buffer, lineterminator="\n")
        writer.writerow([c.get("name") for c in columns])
        writer.writerows(rows)
        result: dict[str, Any] = {
            "kind": kind,
            "title": data.get("title"),
            "columns": columns,
            "rows_in_component": len(rows),
            "total_rows": data.get("total_rows", len(rows)),
            "csv": buffer.getvalue()[:READ_CHARS],
        }
        if data.get("source"):
            # A preview of a longer table: the full table is in this file.
            result["source"] = data["source"]
        return result
    content = json.dumps(data, ensure_ascii=False)
    return {"kind": kind, "data": content[:READ_CHARS], "cut": len(content) > READ_CHARS}
