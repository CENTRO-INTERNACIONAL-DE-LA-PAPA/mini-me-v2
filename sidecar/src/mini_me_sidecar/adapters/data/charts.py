"""The chart description a filled template becomes. Only our templates produce one, so its
structure is checked by the template format test, not at runtime."""

import re
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

# Marks that compute their shapes from many rows, so they need the table's own rows.
STATISTICAL_MARKS = frozenset(
    """bollingerX bollingerY boxX boxY contour delaunayLink delaunayMesh hull voronoi
    voronoiMesh density linearRegressionX linearRegressionY raster""".split()
)

COLOUR_CHANNELS = frozenset({"fill", "stroke"})

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

MIN_HEIGHT, MAX_HEIGHT = 200, 800

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

    name: str
    column: str | None = None
    value: Value | None = None


class MarkOption(BaseModel):
    """A constant option of a mark, such as `curve` "step", `inset` 1 or `sort` {"x": "-y"}."""

    name: str
    value: Value | dict[str, str]


class Mark(BaseModel):
    """An Observable Plot mark drawing the rows of `dataset` or, when `dataset` is null, one
    shape per entry of `values`, for reference lines and notes."""

    mark: str
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
    pixels; `colour` replaces the Mini-Me's colour for uncoloured marks; `categories` are
    number columns coloured as categories, not along a scale."""

    title: str
    height: int | None = None
    colour: str | None = None
    datasets: list[Dataset] = []
    marks: list[Mark]
    scales: list[Scale] = []
    categories: list[str] = []


def is_summarized(dataset: Dataset) -> bool:
    return any(o.kind in SUMMARIZING for o in dataset.operations)


def aggregate_name(aggregate: Aggregate) -> str:
    if aggregate.name:
        return aggregate.name
    return "count" if aggregate.how == "count" else f"{aggregate.how}_{aggregate.column}"


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
