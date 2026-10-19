"""Tables: reading a table file into a DataFrame, and showing a table as a `table`
Interactive Component, built the same way whether an adapter or a model shows it."""

import math
from datetime import date, datetime
from typing import Any

import pandas as pd

from mini_me_sidecar.adapters.data.preview import MAX_ROWS, table_data, table_text
from mini_me_sidecar.adapters.data.tables import (
    MAX_TABLE_BYTES,
    TABLE_EXTENSIONS,
    Table,
    column_type,
    parse_table,
)
from mini_me_sidecar.context import CallContext, TraitError
from mini_me_sidecar.tools.base import ToolError, add_component, find_asset

COLUMN_TYPES = ("number", "text", "date", "boolean")


async def read_table(ctx: CallContext, asset_id: str, name: str, text: str = "") -> Table:
    """The table in the Asset `asset_id`, named `name`. For Excel, reads the sheet whose name
    appears in `text`, else the first."""
    ctx.progress(f"Reading {name}")
    data = await ctx.read_asset(asset_id)
    if len(data) > MAX_TABLE_BYTES:
        raise ToolError(
            f"{name} is larger than 100 MiB, the limit for data files.", "table_too_large"
        )
    try:
        return parse_table(name, data, text)
    except TraitError as error:
        raise ToolError(str(error), error.code) from None


async def show_frame(
    ctx: CallContext, frame: pd.DataFrame, title: str, source: str | None = None
) -> str:
    """Shows `frame` as a table, a preview of its first rows when it is long, and returns
    the component's ID. `source` names the file that holds the full table."""
    data = table_data(frame, title=title, source=source)
    ctx.progress("Showing a table")
    return await add_component(ctx, "table", data, table_text(data))


async def show_table(
    ctx: CallContext,
    title: str | None = None,
    columns: list[dict[str, Any]] | None = None,
    rows: list[list[Any]] | None = None,
    asset_id: str | None = None,
) -> dict[str, Any]:
    """The form of showing a table offered to models: from the columns and rows the model
    writes, or from one of the Conversation's CSV, TSV or Excel files."""
    if asset_id:
        if columns or rows:
            raise ToolError("Give either columns and rows, or an asset_id, not both.")
        asset = await find_asset(ctx, asset_id)
        name = str(asset.get("name", ""))
        if not name.lower().endswith(TABLE_EXTENSIONS):
            raise ToolError("Only CSV, TSV and Excel files can be shown as tables.")
        table = await read_table(ctx, asset_id, name)
        data = table_data(table.frame, title=title or name, source=name)
    elif columns is not None and rows is not None:
        check_table(columns, rows)
        data = given_table(title, columns, rows)
    else:
        raise ToolError("Give columns and rows, or the asset_id of a CSV, TSV or Excel file.")
    ctx.progress("Showing a table")
    component_id = await add_component(ctx, "table", data, table_text(data))
    return {
        "component_id": component_id,
        "rows_shown": len(data["rows"]),
        "total_rows": data.get("total_rows", len(data["rows"])),
    }


def check_table(columns: list[dict[str, Any]], rows: list[list[Any]]) -> None:
    """Fails on columns or rows a `table` component cannot hold, naming the first problem."""
    if not columns:
        raise ToolError("A table needs at least one column.")
    names: list[str] = []
    for column in columns:
        name = column.get("name") if isinstance(column, dict) else None
        if not isinstance(name, str) or not name.strip():
            raise ToolError("Every column needs a name.")
        if name in names:
            raise ToolError(f"Two columns are named {name!r}.")
        if column.get("type") not in COLUMN_TYPES:
            raise ToolError(f"Column {name!r} needs a type: number, text, date or boolean.")
        names.append(name)
    if len(rows) > MAX_ROWS:
        raise ToolError(f"A table holds at most {MAX_ROWS} rows; this one has {len(rows)}.")
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, list) or len(row) != len(columns):
            count = len(row) if isinstance(row, list) else 0
            raise ToolError(f"Row {index} has {count} values for {len(columns)} columns.")
        for column, value in zip(columns, row):
            if not _fits(value, column["type"]):
                raise ToolError(
                    f"Row {index}, column {column['name']!r}: {value!r} is not a "
                    f"{column['type']} value."
                )


def given_table(
    title: str | None, columns: list[dict[str, Any]], rows: list[list[Any]]
) -> dict[str, Any]:
    """The data of a `table` component from columns and rows that passed `check_table`."""
    data: dict[str, Any] = {
        "columns": [{"name": c["name"], "type": c["type"]} for c in columns],
        "rows": rows,
    }
    if title:
        data["title"] = title
    return data


def table_result(frame: pd.DataFrame, start: int) -> dict[str, Any]:
    """Up to `MAX_ROWS` rows of `frame` from row `start` as CSV text, with its columns and
    total row count, for a model to read."""
    part = frame.iloc[start : start + MAX_ROWS]
    return {
        "columns": [{"name": str(n), "type": column_type(frame[n])} for n in frame.columns],
        "start": start,
        "total_rows": len(frame),
        "more": start + len(part) < len(frame),
        "csv": part.to_csv(index=False),
    }


def _fits(value: Any, kind: str) -> bool:
    if value is None:
        return True
    match kind:
        case "number":
            return (
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
            )
        case "boolean":
            return isinstance(value, bool)
        case "date":
            return isinstance(value, str) and _is_iso_date(value)
        case _:
            return isinstance(value, str)


def _is_iso_date(value: str) -> bool:
    for parse in (date.fromisoformat, datetime.fromisoformat):
        try:
            parse(value)
            return True
        except ValueError:
            continue
    return False
