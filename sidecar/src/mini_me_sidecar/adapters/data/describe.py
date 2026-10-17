"""What the AI model is told about a table: names, types and statistics, and the most frequent
values of category columns. Rows are never included."""

import re
from typing import Any

from mini_me_sidecar.adapters.data.tables import Table, column_type, plain_value

# Only columns with at most this many distinct values list them.
MAX_LISTED_DISTINCT = 30

TOP_VALUES = 20

# A column whose name contains one of these words may hold personal data, so its values are
# never listed. Words are matched between separators, so `farmer_name` matches `name`.
PERSONAL = re.compile(
    r"(?:^|[^a-z])(name|names|nombre|nombres|apellido|phone|tel|telefono|teléfono|mobile|"
    r"celular|email|e-mail|mail|correo|address|direccion|dirección|dni|document|documento|"
    r"passport|lat|lon|lng|latitude|longitude|latitud|longitud|gps|coord|coords|"
    r"coordinates|coordenadas)(?:$|[^a-z])",
    re.IGNORECASE,
)


def describe(table: Table, values: bool = True) -> tuple[dict[str, Any], list[str]]:
    """The description of `table` for the model, and the columns whose values it lists.
    With `values` false, only names and types are given."""
    frame = table.frame
    columns = []
    listed: list[str] = []
    for name in frame.columns:
        series = frame[name]
        kind = column_type(series)
        entry: dict[str, Any] = {"name": str(name), "type": kind}
        if values:
            non_null = series.dropna()
            distinct = int(non_null.nunique())
            entry["missing"] = int(series.isna().sum())
            entry["distinct"] = distinct
            if kind in ("number", "date") and len(non_null):
                entry["min"] = plain_value(non_null.min())
                entry["max"] = plain_value(non_null.max())
            if _may_list(str(name), distinct, len(non_null)):
                counts = non_null.astype(str).value_counts().head(TOP_VALUES)
                entry["top_values"] = [[value, int(n)] for value, n in counts.items()]
                listed.append(str(name))
        columns.append(entry)
    description: dict[str, Any] = {"file": table.name, "rows": len(frame), "columns": columns}
    if table.sheet is not None:
        description["sheet"] = table.sheet
    return description, listed


def shared_line(listed: list[str]) -> str:
    """The closing line of a reply whose Trait described its tables with statistics."""
    line = "_Shared with the AI model: column names, types and statistics"
    if listed:
        line += "; values of " + ", ".join(f"`{name}`" for name in listed)
    return line + "._"


def _may_list(name: str, distinct: int, non_null: int) -> bool:
    if PERSONAL.search(name) or distinct == 0 or distinct > MAX_LISTED_DISTINCT:
        return False
    # Mostly distinct values (IDs, free text) say little about categories and a lot about rows.
    return distinct <= non_null / 2

