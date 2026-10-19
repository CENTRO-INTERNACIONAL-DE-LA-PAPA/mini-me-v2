"""Turns a DataFrame into the data of a `table` Interactive Component, small enough for the
core's 2 MiB limit, and into its plain-text alternative."""

import json
import math
from typing import Any

import pandas as pd

from mini_me_sidecar.adapters.data.tables import column_type

MAX_ROWS = 500

# Leaves room for the rest of the component under the core's 2 MiB limit.
MAX_BYTES = 1_500_000

TEXT_ROWS = 20


def table_data(
    frame: pd.DataFrame, title: str | None = None, source: str | None = None
) -> dict[str, Any]:
    """`{ columns, rows }` with `title`, and with `total_rows` and `source` when the rows are
    a preview of a larger table."""
    columns = [{"name": str(name), "type": column_type(frame[name])} for name in frame.columns]
    rows = [[json_value(value) for value in row] for row in frame.head(MAX_ROWS).itertuples(False)]
    while rows and len(json.dumps(rows)) > MAX_BYTES:
        rows = rows[: len(rows) // 2]
    data: dict[str, Any] = {"columns": columns, "rows": rows}
    if title:
        data["title"] = title
    if len(rows) < len(frame):
        data["total_rows"] = len(frame)
        if source:
            data["source"] = source
    return data


def table_text(data: dict[str, Any]) -> str:
    """The first rows as tab-separated text, for history and app versions without the kind."""
    lines = ["\t".join(c["name"] for c in data["columns"])]
    for row in data["rows"][:TEXT_ROWS]:
        lines.append("\t".join("" if v is None else str(v) for v in row))
    total = data.get("total_rows", len(data["rows"]))
    if total > min(len(data["rows"]), TEXT_ROWS):
        lines.append(f"… {total} rows in all")
    title = data.get("title")
    return "\n".join([title, *lines] if title else lines)


def json_value(value: Any) -> Any:
    """A cell as a JSON value: missing values and non-finite numbers as null, dates as ISO
    text."""
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat() if value == value.normalize() else value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (bool, int, float, str)):
        return value
    return None if pd.isna(value) else str(value)
