"""Reading tables, and `table` components built the same whether an adapter or a model shows one."""

import math
import re
import sys
from datetime import date, datetime
from typing import Any

import pandas as pd

from mini_me_sidecar.adapters.data.describe import describe
from mini_me_sidecar.adapters.data.preview import MAX_ROWS, table_data, table_text
from mini_me_sidecar.adapters.data.tables import (
    MAX_TABLE_BYTES,
    TABLE_EXTENSIONS,
    Table,
    column_type,
    parse_table,
)
from mini_me_sidecar.adapters.data.worker import WORKERS
from mini_me_sidecar.context import CallContext, TraitError
from mini_me_sidecar.tools.base import ToolError, add_component, find_asset
from mini_me_sidecar.tools.files import MAX_FILE_BYTES, save_file

# Characters a file name may not hold, on Windows or anywhere.
NOT_IN_FILE_NAMES = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

COLUMN_TYPES = ("number", "text", "date", "boolean")


async def read_table(ctx: CallContext, asset_id: str, name: str, text: str = "") -> Table:
    """For Excel, reads the sheet named in `text`, else the first."""
    ctx.progress(f"Reading {name}")
    data = await ctx.read_asset(asset_id)
    if len(data) > MAX_TABLE_BYTES:
        raise ToolError(
            f"{name} is larger than 100 MiB, the limit for data files.", "table_too_large"
        )
    try:
        table = await WORKERS.run(ctx, parse_table, name, data, text)
    except TraitError as error:
        raise ToolError(str(error), error.code) from None
    table.source_id = asset_id
    return table


async def show_frame(
    ctx: CallContext,
    frame: pd.DataFrame,
    title: str,
    source: dict[str, Any] | None = None,
    results_name: str | None = None,
) -> str:
    """Shows `frame`, previewed when long, and returns the component's ID. `source` is the
    saved file holding it, as `save_file` returns it; without one, a computed result is first
    saved as the hidden CSV file `results_name`."""
    if source is None and results_name is not None:
        hidden = await _save_hidden_csv(ctx, frame, results_name)
        data = table_data(frame, title=title)
        source_id = hidden["asset_id"] if hidden else None
    else:
        file = source or {}
        data = table_data(frame, title=title, source=file.get("name"))
        source_id = file.get("asset_id")
    ctx.progress("Showing a table")
    return await add_component(ctx, "table", data, table_text(data), source_id)


async def _save_hidden_csv(
    ctx: CallContext, frame: pd.DataFrame, name: str
) -> dict[str, Any] | None:
    """Saves `frame` as the hidden CSV `name`: `{ asset_id, name }`, or None over 32 MiB."""
    data = frame.to_csv(index=False).encode()
    if len(data) > MAX_FILE_BYTES:
        return None
    return await save_file(ctx, name, "text/csv", data, hidden=True)


async def show_table(
    ctx: CallContext,
    title: str | None = None,
    columns: list[dict[str, Any]] | None = None,
    rows: list[list[Any]] | None = None,
    asset_id: str | None = None,
) -> dict[str, Any]:
    """The form offered to models: the model's own columns and rows, or a CSV, TSV or Excel file."""
    if asset_id:
        if columns or rows:
            raise ToolError("Give either columns and rows, or an asset_id, not both.")
        asset = await find_asset(ctx, asset_id)
        name = str(asset.get("name", ""))
        if not name.lower().endswith(TABLE_EXTENSIONS):
            raise ToolError("Only CSV, TSV and Excel files can be shown as tables.")
        table = await read_table(ctx, asset_id, name)
        data = table_data(table.frame, title=title or name, source=name, sheet=table.sheet)
        source_id = asset_id
    elif columns is not None and rows is not None:
        check_table(columns, rows)
        name = csv_name(title)
        frame = given_frame(columns, rows)
        saved = await save_file(ctx, name, "text/csv", frame.to_csv(index=False).encode())
        data = {**given_table(title, columns, rows), "source": saved["name"]}
        source_id = saved["asset_id"]
    else:
        raise ToolError("Give columns and rows, or the asset_id of a CSV, TSV or Excel file.")
    ctx.progress("Showing a table")
    component_id = await add_component(ctx, "table", data, table_text(data), source_id)
    return {
        "component_id": component_id,
        "rows_shown": len(data["rows"]),
        "total_rows": data.get("total_rows", len(data["rows"])),
    }


def csv_name(title: str | None) -> str:
    """`<title>.csv`, or `Table.csv` without a title; a title ending in a table file's extension
    loses it, and characters a file name cannot hold become `-`."""
    stem = (title or "").strip()
    for extension in TABLE_EXTENSIONS:
        if stem.lower().endswith(extension) and len(stem) > len(extension):
            stem = stem[: -len(extension)]
            break
    stem = NOT_IN_FILE_NAMES.sub("-", stem).strip(" .")
    return f"{stem or 'Table'}.csv"


def given_frame(columns: list[dict[str, Any]], rows: list[list[Any]]) -> pd.DataFrame:
    """The rows of a `table` component as a DataFrame, each column of its component type."""
    names = [str(c.get("name")) for c in columns]
    frame = pd.DataFrame(rows, columns=names, dtype=object)
    for column, name in zip(columns, names):
        match column.get("type"):
            case "number":
                frame[name] = pd.to_numeric(frame[name])
            case "date":
                frame[name] = pd.to_datetime(frame[name])
            case "boolean":
                frame[name] = frame[name].astype("boolean")
    return frame


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


SAMPLE_ROWS = 20

SHOWING_NOTE = (
    "To show this table to the user, use show_table with this file's ID; never copy its rows. "
    "Read again with `rows` only when the answer needs specific rows."
)


def table_result(table: Table, start: int, rows: int | None = None) -> dict[str, Any]:
    """For a model: without `rows`, the table's description and a sample of rows from `start`;
    with `rows`, the columns and up to that many rows from `start` (at most `MAX_ROWS`)."""
    frame = table.frame
    part = frame.iloc[start : start + (SAMPLE_ROWS if rows is None else min(rows, MAX_ROWS))]
    found: dict[str, Any] = {
        "start": start,
        "total_rows": len(frame),
        "more": start + len(part) < len(frame),
        "csv": part.to_csv(index=False),
    }
    if rows is None:
        return {"description": describe(table), **found, "note": SHOWING_NOTE}
    columns = [{"name": str(n), "type": column_type(frame[n])} for n in frame.columns]
    return {"columns": columns, **found}


def _fits(value: Any, kind: str) -> bool:
    if value is None:
        return True
    match kind:
        case "number":
            # A table's numbers must fit a float. An int is compared rather than passed to
            # `math.isfinite`, which raises for one beyond a float's range.
            if isinstance(value, bool):
                return False
            if isinstance(value, int):
                return abs(value) <= sys.float_info.max
            return isinstance(value, float) and math.isfinite(value)
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
