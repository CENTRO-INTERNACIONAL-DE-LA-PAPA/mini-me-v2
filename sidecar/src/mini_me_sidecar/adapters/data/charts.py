"""The chart description a filled template becomes, and its checks against the table. Mark,
channel, option and scheme names are plain text checked against fixed lists."""

import re
from dataclasses import dataclass, field
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

# Observable Plot's marks, by function name, except `geo`, `graticule`, `sphere` and `image`,
# which need map data or pictures, and `auto`, `tip`, `crosshair`, whose tooltips the app draws.
MARKS = frozenset(
    """area areaX areaY arrow axisX axisY axisFx axisFy gridX gridY gridFx gridFy barX barY
    bollingerX bollingerY boxX boxY cell cellX cellY contour delaunayLink delaunayMesh hull
    voronoi voronoiMesh density differenceX differenceY dot dotX dotY circle hexagon frame
    hexgrid line lineX lineY linearRegressionX linearRegressionY link raster rect rectX rectY
    ruleX ruleY text textX textY tickX tickY tree cluster vector vectorX vectorY spike waffleX
    waffleY""".split()
)

# Marks that compute their shapes from many rows, so they need the table's own rows.
STATISTICAL_MARKS = frozenset(
    """bollingerX bollingerY boxX boxY contour delaunayLink delaunayMesh hull voronoi
    voronoiMesh density linearRegressionX linearRegressionY raster""".split()
)

CHANNELS = frozenset(
    """x y x1 x2 y1 y2 fill stroke r opacity fillOpacity strokeOpacity strokeWidth symbol text
    fx fy z rotate length weight path""".split()
)

COLOUR_CHANNELS = frozenset({"fill", "stroke"})

OPTIONS = frozenset(
    """curve marker markerStart markerMid markerEnd inset insetLeft insetRight insetTop
    insetBottom dx dy textAnchor lineAnchor fontSize fontWeight fontStyle lineWidth bandwidth
    thresholds interval strokeDasharray strokeLinecap rx ry frameAnchor bend headLength ci n k
    unit gap anchor shape sort""".split()
)

SCHEMES = frozenset(
    """blues greens greys oranges purples reds bugn bupu gnbu orrd pubu pubugn purd rdpu ylgn
    ylgnbu ylorbr ylorrd viridis magma inferno plasma cividis turbo warm cool cubehelix brbg
    prgn piyg puor rdbu rdgy rdylbu rdylgn spectral burd buylrd category10 accent dark2 paired
    pastel1 pastel2 set1 set2 set3 tableau10 observable10""".split()
)

# The channels each scale reads; a log scale needs their columns to be positive.
SCALE_CHANNELS = {
    "x": ("x", "x1", "x2"),
    "y": ("y", "y1", "y2"),
    "r": ("r",),
    "length": ("length",),
}

# A hex colour or a CSS colour name.
COLOUR = re.compile(r"^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$")

DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT = 300, 200, 800

Value = str | float | bool


class Filter(BaseModel):
    """Keeps the rows whose `column` compares to `value` by `operator`. `in` takes a list of
    values; `not_missing` takes none."""

    kind: Literal["filter"]
    column: str
    operator: Literal["==", "!=", "<", "<=", ">", ">=", "in", "not_missing"]
    value: Value | list[Value] | None = None


class Aggregate(BaseModel):
    """`how` of `column` per group, as the column `name` (by default `count` or
    `<how>_<column>`). `count` counts rows and takes no column."""

    how: Literal["count", "sum", "mean", "median", "min", "max", "std"]
    column: str | None = None
    name: str | None = None


class Group(BaseModel):
    """One row per combination of the `by` columns' values, with the aggregates; with no `by`
    columns, one row for the whole dataset."""

    kind: Literal["group"]
    by: list[str]
    aggregates: list[Aggregate]


class Bin(BaseModel):
    """Replaces a number or date `column` with `<column>_start` and `<column>_end`, the bounds
    of each row's bin. `bins` is the most bins; null chooses a count from the data. Group by
    both bounds to count rows per bin."""

    kind: Literal["bin"]
    column: str
    bins: int | None = None


class Correlate(BaseModel):
    """Replaces the rows with the Pearson correlation of each pair of number `columns`, as the
    columns `x`, `y` and `correlation`."""

    kind: Literal["correlate"]
    columns: list[str]


class Unpivot(BaseModel):
    """Turns `columns` into rows: each row's other columns, the column's name as `names_to` and
    its value as `values_to`."""

    kind: Literal["unpivot"]
    columns: list[str]
    names_to: str
    values_to: str


class SortRows(BaseModel):
    """Sorts the rows by the `by` columns."""

    kind: Literal["sort"]
    by: list[str]
    descending: bool = False


class Top(BaseModel):
    """Keeps the first `n` rows."""

    kind: Literal["top"]
    n: int


Operation = Annotated[
    Union[Filter, Group, Bin, Correlate, Unpivot, SortRows, Top], Field(discriminator="kind")
]

# Operations whose rows are no longer the table's own rows; such datasets are never sampled.
SUMMARIZING = ("group", "bin", "correlate")


class Dataset(BaseModel):
    """Rows built from the table by `operations`, in order; with none, the table's own rows."""

    name: str
    operations: list[Operation] = []


class Channel(BaseModel):
    """Channel `name` shows `column` of the mark's dataset, or else the constant `value`. A
    colour constant is a CSS colour name or a hex colour, used only when the user names a
    colour."""

    name: str = Field(description="One of: " + ", ".join(sorted(CHANNELS)))
    column: str | None = None
    value: Value | None = None


class MarkOption(BaseModel):
    """A constant option of a mark, such as `curve` "step", `inset` 1 or `sort` {"x": "-y"}."""

    name: str = Field(description="One of: " + ", ".join(sorted(OPTIONS)))
    value: Value | dict[str, str]


class Mark(BaseModel):
    """An Observable Plot mark drawing the rows of `dataset` or, when `dataset` is null, one
    shape per entry of `values`, for reference lines and notes."""

    mark: str = Field(description="An Observable Plot mark function: " + ", ".join(sorted(MARKS)))
    dataset: str | None = None
    values: list[Value] = []
    channels: list[Channel] = []
    options: list[MarkOption] = []


class Scale(BaseModel):
    """Options of one scale; null leaves Observable Plot's default. `scheme` is a colour scheme
    name, used only when the user asks for one."""

    scale: Literal["x", "y", "fx", "fy", "color", "r", "opacity", "symbol", "length"]
    type: (
        Literal[
            "linear", "log", "sqrt", "symlog", "time", "utc", "band", "point", "ordinal",
            "sequential", "diverging",
        ]
        | None
    ) = None
    label: str | None = None
    domain: list[Value] | None = None
    reverse: bool | None = None
    zero: bool | None = None
    nice: bool | None = None
    percent: bool | None = None
    tick_rotate: float | None = None
    scheme: str | None = None
    legend: bool | None = None


class ChartDescription(BaseModel):
    """One chart: its datasets, the marks drawn from them, and its scales. `height` is in
    pixels; `colour` replaces the Mini-Me's colour for uncoloured marks."""

    title: str
    height: int | None = None
    colour: str | None = None
    datasets: list[Dataset] = []
    marks: list[Mark]
    scales: list[Scale] = []


@dataclass
class CheckedChart:
    """`chart` is None when no mark is left; `columns` are each dataset's types as built."""

    chart: ChartDescription | None
    ignored: list[tuple[str, str]] = field(default_factory=list)
    columns: dict[str, dict[str, str]] = field(default_factory=dict)


def check_chart(chart: ChartDescription, types: dict[str, str]) -> CheckedChart:
    """The parts of `chart` that fit a table of `types`; an invalid dataset drops its marks."""
    result = CheckedChart(None)
    datasets = []
    for dataset in chart.datasets:
        if dataset.name in result.columns:
            result.ignored.append((f'dataset "{dataset.name}"', "another dataset has that name"))
            continue
        columns, reason = dataset_columns(dataset, types)
        if reason is None:
            datasets.append(dataset)
            result.columns[dataset.name] = columns
        else:
            result.ignored.append((f'dataset "{dataset.name}"', reason))
    summarized = {d.name for d in datasets if is_summarized(d)}
    marks = []
    for mark in chart.marks:
        checked, reason = _check_mark(mark, result.columns, summarized, result.ignored)
        if reason is None:
            marks.append(checked)
        else:
            result.ignored.append((describe_mark(mark), reason))
    scales = []
    for scale in chart.scales:
        if scale.scheme is not None and scale.scheme.lower() not in SCHEMES:
            result.ignored.append((f"scheme {scale.scheme}", "not a known colour scheme"))
            scale = scale.model_copy(update={"scheme": None})
        scales.append(scale)
    if not marks:
        result.ignored.append((f'chart "{chart.title}"', "no mark could be drawn"))
        return result
    colour = chart.colour
    if colour is not None and not COLOUR.match(colour):
        result.ignored.append((f"colour {colour}", "not a colour"))
        colour = None
    used = {m.dataset for m in marks}
    height = chart.height or DEFAULT_HEIGHT
    result.chart = chart.model_copy(
        update={
            "height": min(max(height, MIN_HEIGHT), MAX_HEIGHT),
            "datasets": [d for d in datasets if d.name in used],
            "marks": marks,
            "scales": scales,
            "colour": colour,
        }
    )
    return result


def dataset_columns(
    dataset: Dataset, types: dict[str, str]
) -> tuple[dict[str, str], str | None]:
    """The column types after `dataset`'s operations, or why one of them can't run."""
    columns = dict(types)
    for operation in dataset.operations:
        reason = _operation_problem(operation, columns)
        if reason is not None:
            return columns, f"{operation.kind}: {reason}"
        columns = _columns_after(operation, columns)
    return columns, None


def is_summarized(dataset: Dataset) -> bool:
    return any(o.kind in SUMMARIZING for o in dataset.operations)


def aggregate_name(aggregate: Aggregate) -> str:
    if aggregate.name:
        return aggregate.name
    return "count" if aggregate.how == "count" else f"{aggregate.how}_{aggregate.column}"


def _missing(names: list[str], columns: dict[str, str]) -> str | None:
    missing = [n for n in names if n not in columns]
    return "no column " + ", ".join(f"`{n}`" for n in missing) if missing else None


def _operation_problem(operation: Operation, columns: dict[str, str]) -> str | None:
    if isinstance(operation, Filter):
        return _missing([operation.column], columns) or _filter_problem(
            operation, columns[operation.column]
        )
    if isinstance(operation, Group):
        named = [a.column for a in operation.aggregates if a.column is not None]
        if reason := _missing(operation.by + named, columns):
            return reason
        if not operation.aggregates:
            return "no aggregate given"
        names = operation.by + [aggregate_name(a) for a in operation.aggregates]
        if len(set(names)) < len(names):
            return "two output columns have the same name"
        for aggregate in operation.aggregates:
            kind = columns.get(aggregate.column or "")
            if aggregate.how == "count":
                continue
            if aggregate.column is None:
                return f"{aggregate.how} needs a column"
            allowed = ("number", "date") if aggregate.how in ("min", "max") else ("number",)
            if kind not in allowed:
                return f"`{aggregate.column}` is a {kind} column, and {aggregate.how} needs numbers"
        return None
    if isinstance(operation, Bin):
        if reason := _missing([operation.column], columns):
            return reason
        kind = columns[operation.column]
        if kind not in ("number", "date"):
            return f"`{operation.column}` is a {kind} column, not numbers or dates"
        if operation.bins is not None and operation.bins < 1:
            return "needs at least 1 bin"
        return None
    if isinstance(operation, Correlate):
        if reason := _missing(operation.columns, columns):
            return reason
        if len(set(operation.columns)) < 2:
            return "needs at least 2 columns"
        wrong = [c for c in operation.columns if columns[c] != "number"]
        return ", ".join(f"`{c}`" for c in wrong) + " is not a number column" if wrong else None
    if isinstance(operation, Unpivot):
        if reason := _missing(operation.columns, columns):
            return reason
        if not operation.columns:
            return "no columns given"
        if len({columns[c] for c in operation.columns}) > 1:
            return "the columns have different types"
        kept = [c for c in columns if c not in operation.columns]
        if {operation.names_to, operation.values_to} & set(kept) or (
            operation.names_to == operation.values_to
        ):
            return "a new column has the name of another"
        return None
    if isinstance(operation, SortRows):
        return _missing(operation.by, columns) or (None if operation.by else "no columns given")
    return None if operation.n >= 1 else "needs at least 1 row"


def _filter_problem(operation: Filter, kind: str) -> str | None:
    if operation.operator == "not_missing":
        return None
    values = operation.value if isinstance(operation.value, list) else [operation.value]
    if operation.operator == "in" and not isinstance(operation.value, list):
        return "`in` needs a list of values"
    if operation.operator != "in" and isinstance(operation.value, list):
        return f"`{operation.operator}` needs one value"
    if operation.operator in ("<", "<=", ">", ">=") and kind not in ("number", "date"):
        return f"`{operation.column}` is a {kind} column and can't be compared by order"
    for value in values:
        if value is None:
            return "no value given"
        if kind == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))):
            return f"{value!r} is not a number"
        if kind == "boolean" and not isinstance(value, bool):
            return f"{value!r} is not true or false"
    return None


def _columns_after(operation: Operation, columns: dict[str, str]) -> dict[str, str]:
    if isinstance(operation, Group):
        after = {c: columns[c] for c in operation.by}
        for aggregate in operation.aggregates:
            kind = columns.get(aggregate.column or "")
            keeps = aggregate.how in ("min", "max") and kind == "date"
            after[aggregate_name(aggregate)] = "date" if keeps else "number"
        return after
    if isinstance(operation, Bin):
        kind = columns[operation.column]
        after = {c: t for c, t in columns.items() if c != operation.column}
        after |= {f"{operation.column}_start": kind, f"{operation.column}_end": kind}
        return after
    if isinstance(operation, Correlate):
        return {"x": "text", "y": "text", "correlation": "number"}
    if isinstance(operation, Unpivot):
        after = {c: t for c, t in columns.items() if c not in operation.columns}
        after |= {
            operation.names_to: "text",
            operation.values_to: columns[operation.columns[0]],
        }
        return after
    return columns


def _check_mark(
    mark: Mark,
    datasets: dict[str, dict[str, str]],
    summarized: set[str],
    ignored: list[tuple[str, str]],
) -> tuple[Mark, str | None]:
    """The mark less its invalid channels and options (into `ignored`), or why it can't be drawn."""
    if mark.mark not in MARKS:
        return mark, f"`{mark.mark}` is not a mark that can be drawn"
    if mark.mark in STATISTICAL_MARKS and mark.dataset in summarized:
        return mark, "it needs the table's own rows, not grouped, binned or correlated ones"
    if mark.dataset is None:
        if not mark.values:
            return mark, "no dataset or values given"
        columns: dict[str, str] = {}
    elif mark.dataset not in datasets:
        return mark, f'no valid dataset "{mark.dataset}"'
    else:
        columns = datasets[mark.dataset]
    if reason := _missing([c.column for c in mark.channels if c.column is not None], columns):
        return mark, reason
    channels = []
    for channel in mark.channels:
        reason = _channel_problem(channel)
        if reason is None:
            channels.append(channel)
        else:
            ignored.append((f"{mark.mark} channel {channel.name}", reason))
    options = [o for o in mark.options if o.name in OPTIONS]
    ignored.extend(
        (f"{mark.mark} option {o.name}", "not an option that can be set")
        for o in mark.options
        if o.name not in OPTIONS
    )
    return mark.model_copy(update={"channels": channels, "options": options}), None


def _channel_problem(channel: Channel) -> str | None:
    if channel.name not in CHANNELS:
        return "not a channel that can be set"
    if channel.column is not None:
        return None
    if channel.value is None:
        return "no column or value given"
    if channel.name in COLOUR_CHANNELS and not (
        isinstance(channel.value, str) and COLOUR.match(channel.value)
    ):
        return f"{channel.value!r} is not a colour"
    return None


def scale_columns(chart: ChartDescription, scale: str) -> list[tuple[str, str]]:
    """The `(dataset, column)` pairs that the channels of `scale` show."""
    names = SCALE_CHANNELS.get(scale, ())
    return [
        (m.dataset, c.column)
        for m in chart.marks
        for c in m.channels
        if m.dataset is not None and c.column is not None and c.name in names
    ]


def colour_column(chart: ChartDescription) -> tuple[str, str] | None:
    """The `(dataset, column)` of the first mark coloured by a column, which the legend shows."""
    for mark in chart.marks:
        for channel in mark.channels:
            if channel.name in COLOUR_CHANNELS and channel.column and mark.dataset:
                return mark.dataset, channel.column
    return None


def describe_mark(mark: Mark) -> str:
    named = [c.column for c in mark.channels if c.column]
    return f"{mark.mark}({', '.join(dict.fromkeys(named))})"
