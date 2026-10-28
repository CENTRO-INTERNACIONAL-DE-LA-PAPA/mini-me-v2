"""The fixed lists the AI model chooses from: data checks, cleaning actions, how to join two
tables and which charts to draw. The model fills these schemas; entries that don't fit the tables are dropped before
anything runs."""

import re
from typing import Literal, Union

from pydantic import BaseModel

ColumnType = Literal["number", "text", "date", "boolean"]


class NotNull(BaseModel):
    """Every value in these columns is present."""

    kind: Literal["not_null"]
    columns: list[str]


class Unique(BaseModel):
    """No two rows share the same values in these columns (a unique key)."""

    kind: Literal["unique"]
    columns: list[str]


class InRange(BaseModel):
    """Values of a number column lie between `min` and `max`; either bound may be null."""

    kind: Literal["in_range"]
    column: str
    min: float | None
    max: float | None


class InSet(BaseModel):
    """Values of the column are one of `values`."""

    kind: Literal["in_set"]
    column: str
    values: list[str]


class Matches(BaseModel):
    """Values of the column match the regular expression `pattern`."""

    kind: Literal["matches"]
    column: str
    pattern: str


class HasType(BaseModel):
    """Values of the column are all of `type`."""

    kind: Literal["has_type"]
    column: str
    type: ColumnType


# Plain unions, without pydantic's `discriminator`: some providers reject that keyword in a
# tool's schema. Each entry's `kind` literal still tells them apart.
Check = Union[NotNull, Unique, InRange, InSet, Matches, HasType]


class CheckPlan(BaseModel):
    """The checks to run, besides the defaults."""

    checks: list[Check]


class StripWhitespace(BaseModel):
    """Removes spaces at the start and end of text values, in `columns` or, if null, in every
    text column."""

    kind: Literal["strip_whitespace"]
    columns: list[str] | None


class NormalizeMissing(BaseModel):
    """Turns these codes for a missing value (for example "NA", "-", "999") into empty
    values, in `columns` or, if null, everywhere."""

    kind: Literal["normalize_missing"]
    values: list[str]
    columns: list[str] | None


class ChangeCase(BaseModel):
    """Changes the letter case of a text column."""

    kind: Literal["change_case"]
    column: str
    case: Literal["lower", "upper", "title"]


class Cast(BaseModel):
    """Converts a column to `type`; values that can't be converted become empty."""

    kind: Literal["cast"]
    column: str
    type: ColumnType


class ValueMapping(BaseModel):
    old: str
    new: str


class MapValues(BaseModel):
    """Replaces whole values of a column, for example spelling variants of one category."""

    kind: Literal["map_values"]
    column: str
    mapping: list[ValueMapping]


class ReplaceRegex(BaseModel):
    """Replaces matches of the regular expression `pattern` in a text column."""

    kind: Literal["replace_regex"]
    column: str
    pattern: str
    replacement: str


class DropDuplicates(BaseModel):
    """Drops repeated rows, comparing `columns` or, if null, every column; keeps the first."""

    kind: Literal["drop_duplicates"]
    columns: list[str] | None


class DropRowsWhere(BaseModel):
    """Drops the rows where the column compares to `value` with `operator`; `is_missing`
    ignores `value`."""

    kind: Literal["drop_rows_where"]
    column: str
    operator: Literal["==", "!=", "<", "<=", ">", ">=", "is_missing"]
    value: str | float | None


class Clip(BaseModel):
    """Limits a number column to between `min` and `max`; either bound may be null."""

    kind: Literal["clip"]
    column: str
    min: float | None
    max: float | None


class FillMissing(BaseModel):
    """Fills the empty values of a column with `value`."""

    kind: Literal["fill_missing"]
    column: str
    value: str | float


class Rename(BaseModel):
    old: str
    new: str


class RenameColumns(BaseModel):
    """Renames columns."""

    kind: Literal["rename_columns"]
    renames: list[Rename]


class Sort(BaseModel):
    """Sorts the rows by `columns`."""

    kind: Literal["sort"]
    columns: list[str]
    descending: bool


Action = Union[
    StripWhitespace,
    NormalizeMissing,
    ChangeCase,
    Cast,
    MapValues,
    ReplaceRegex,
    DropDuplicates,
    DropRowsWhere,
    Clip,
    FillMissing,
    RenameColumns,
    Sort,
]


class CleanPlan(BaseModel):
    """The cleaning actions to apply, in order."""

    actions: list[Action]


class JoinPlan(BaseModel):
    """How to join the first table (left) to the second (right)."""

    left_on: list[str]
    right_on: list[str]
    how: Literal["inner", "left", "right", "outer"]


ChartType = Literal["histogram", "bar", "line", "scatter", "box", "heatmap"]



class Chart(BaseModel):
    """One chart of the table. Which fields a type uses:
    - histogram: `x` (number or date), optional `series`;
    - bar: `x` (text or boolean), `aggregate` of `y` (number), or `count` with no `y`,
      optional `series`;
    - line: `x` (date or number), `y` (number), `aggregate` for repeated `x` values,
      optional `series`;
    - scatter: `x` and `y` (numbers), optional `series`;
    - box: `x` (text or boolean groups), `y` (number);
    - heatmap: `columns` (two or more numbers), drawn as their correlations.
    Unused fields are null or empty. `alternatives` names other types that show the same
    columns well; the user can switch to them."""

    type: ChartType
    title: str
    x: str | None
    y: str | None
    columns: list[str]
    series: str | None
    aggregate: Literal["count", "sum", "mean", "median"] | None
    alternatives: list[ChartType]


class ChartPlan(BaseModel):
    """The charts to draw: the fewest that answer the message."""

    charts: list[Chart]


# The column types each axis of a chart type accepts.
CHART_AXES: dict[str, dict[str, tuple[str, ...]]] = {
    "histogram": {"x": ("number", "date")},
    "bar": {"x": ("text", "boolean"), "y": ("number",)},
    "line": {"x": ("date", "number"), "y": ("number",)},
    "scatter": {"x": ("number",), "y": ("number",)},
    "box": {"x": ("text", "boolean"), "y": ("number",)},
    "heatmap": {},
}

SERIES_TYPES = ("text", "boolean")


def chart_axes(chart: Chart) -> dict[str, tuple[str, ...]]:
    """The axes `chart` reads a column for, with the column types each accepts. A count bar
    chart has no `y`."""
    axes = dict(CHART_AXES[chart.type])
    if chart.type == "bar" and (chart.aggregate or "count") == "count":
        axes.pop("y")
    return axes


def chart_problem(chart: Chart, types: dict[str, str]) -> str | None:
    """Why `chart` can't be drawn from a table whose columns have `types`, or None when it
    can."""
    if chart.type == "heatmap":
        columns = list(dict.fromkeys(chart.columns))
        missing = [c for c in columns if c not in types]
        if missing:
            return "no column " + ", ".join(f"`{c}`" for c in missing)
        if len(columns) < 2:
            return "a heatmap needs at least 2 number columns"
        wrong = [c for c in columns if types[c] != "number"]
        if wrong:
            return ", ".join(f"`{c}`" for c in wrong) + " is not a number column"
        return None
    for axis, allowed in chart_axes(chart).items():
        column = getattr(chart, axis)
        if column is None:
            return f"no `{axis}` column given"
        if column not in types:
            return f"no column `{column}`"
        if types[column] not in allowed:
            return f"`{column}` is a {types[column]} column, and a {chart.type} needs " + (
                " or ".join(allowed) + f" for `{axis}`"
            )
    if chart.series is not None and chart.type != "box":
        if chart.series not in types:
            return f"no column `{chart.series}`"
        if types[chart.series] not in SERIES_TYPES:
            return f"`{chart.series}` is a {types[chart.series]} column, and series need text"
    return None


def columns_of(entry: BaseModel) -> list[str]:
    """Every column an entry names."""
    names: list[str] = []
    for attribute in ("column", "columns"):
        value = getattr(entry, attribute, None)
        if isinstance(value, str):
            names.append(value)
        elif isinstance(value, list):
            names.extend(value)
    if isinstance(entry, RenameColumns):
        names.extend(r.old for r in entry.renames)
    return names


def problem(entry: BaseModel, columns: list[str]) -> str | None:
    """Why `entry` can't run on a table with `columns`, or None when it can. Renames earlier
    in a plan change `columns`, so cleaning passes the columns as they stand at each step."""
    missing = [c for c in columns_of(entry) if c not in columns]
    if missing:
        return "no column " + ", ".join(f"`{c}`" for c in missing)
    if isinstance(entry, (NotNull, Unique, Sort)) and not entry.columns:
        return "no columns given"
    if isinstance(entry, (InRange, Clip)):
        if entry.min is None and entry.max is None:
            return "no bound given"
        if entry.min is not None and entry.max is not None and entry.min > entry.max:
            return "the minimum is above the maximum"
    if isinstance(entry, (Matches, ReplaceRegex)):
        try:
            re.compile(entry.pattern)
        except re.error:
            return f"invalid pattern {entry.pattern!r}"
    if isinstance(entry, DropRowsWhere) and entry.operator != "is_missing" and entry.value is None:
        return "no value given"
    return None


def describe_entry(entry: BaseModel) -> str:
    """A short label for an entry, such as `in_range(yield, 0–80)`."""
    if isinstance(entry, Chart):
        named = entry.columns if entry.type == "heatmap" else [entry.x, entry.y, entry.series]
        return f"{entry.type}({', '.join(c for c in named if c)})"
    fields = entry.model_dump(exclude={"kind"})
    parts = [f"{k}={v}" for k, v in fields.items() if v is not None]
    kind = getattr(entry, "kind", type(entry).__name__)
    return f"{kind}({', '.join(parts)})"
