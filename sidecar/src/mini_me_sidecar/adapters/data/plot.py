"""Plot: the rows of each dataset a chart description draws, computed with pandas from the full
table, and the chart's text. Only datasets of the table's own rows are sampled, and only to fit
the size limit."""

import json
import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from mini_me_sidecar.adapters.data.charts import (
    STATISTICAL_MARKS,
    Bin,
    ChartDescription,
    Correlate,
    Dataset,
    Filter,
    Group,
    Scale,
    SortRows,
    Unpivot,
    aggregate_name,
    colour_column,
    is_summarized,
    scale_columns,
)
from mini_me_sidecar.adapters.data.preview import json_value
from mini_me_sidecar.adapters.data.templates import ChartChoice, choice_text
from mini_me_sidecar.adapters.data.tables import column_type

# Under the core's 2 MiB limit, leaving room for the title and the JSON the core wraps around it.
MAX_BYTES = 2_000_000

# The most bins a bin operation makes.
MAX_BINS = 100

COMPARE = {
    "==": lambda s, v: s == v,
    "!=": lambda s, v: s != v,
    "<": lambda s, v: s < v,
    "<=": lambda s, v: s <= v,
    ">": lambda s, v: s > v,
    ">=": lambda s, v: s >= v,
}


@dataclass
class ChartResult:
    """Component data and the reply's notes; data that does not `fit` serves only for the text."""

    data: dict[str, Any]
    notes: list[str] = field(default_factory=list)
    ignored: list[tuple[str, str]] = field(default_factory=list)
    fits: bool = True


def build_chart(frame: pd.DataFrame, chart: ChartDescription) -> ChartResult:
    """The component data of a checked chart: its description and each dataset's rows."""
    result = ChartResult({"title": chart.title, "description": None, "datasets": {}})
    frames: dict[str, pd.DataFrame] = {}
    for dataset in chart.datasets:
        rows, dropped = _dataset_rows(frame, dataset, _used_columns(chart, dataset.name))
        frames[dataset.name] = rows
        if dropped:
            _note(result, _missing_note(dropped))
    frames = {name: _as_categories(rows, chart.categories) for name, rows in frames.items()}
    chart = _drop_log_scales(chart, frames, result)
    chart = _with_colour_domain(chart, frame, frames)
    result.data["description"] = chart.model_dump(exclude={"categories"})
    result.data["datasets"] = {name: _dataset_data(rows) for name, rows in frames.items()}
    _fit(result, chart, frames)
    return result


def _as_categories(rows: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """`rows` with the number `columns` as text labels, so they colour as categories."""
    present = [c for c in columns if c in rows.columns]
    if not present:
        return rows
    return rows.assign(**{c: rows[c].map(_label) for c in present})


def _label(value: Any) -> Any:
    if pd.isna(value):
        return value
    return f"{value:g}" if isinstance(value, float) else str(value)


def _note(result: ChartResult, note: str) -> None:
    if note not in result.notes:
        result.notes.append(note)


def _missing_note(dropped: int) -> str:
    if dropped == 1:
        return "1 row with missing values was left out"
    return f"{dropped:,} rows with missing values were left out"


def _used_columns(chart: ChartDescription, dataset: str) -> list[str]:
    named = [
        c.column for m in chart.marks if m.dataset == dataset for c in m.channels if c.column
    ]
    return list(dict.fromkeys(named))


def _dataset_rows(
    frame: pd.DataFrame, dataset: Dataset, shown: list[str]
) -> tuple[pd.DataFrame, int]:
    """The rows with only the `shown` columns, and how many table rows lacked a used value."""
    table_columns = [c for c in _operation_columns(dataset) + shown if c in frame.columns]
    rows = frame.dropna(subset=list(dict.fromkeys(table_columns)))
    dropped = len(frame) - len(rows)
    for operation in dataset.operations:
        rows = _run(rows, operation)
    return rows[shown].reset_index(drop=True), dropped


def _operation_columns(dataset: Dataset) -> list[str]:
    """The columns the operations read, less correlated ones, which pandas pairs itself."""
    names: list[str] = []
    for operation in dataset.operations:
        if isinstance(operation, Filter) and operation.operator != "not_missing":
            names.append(operation.column)
        elif isinstance(operation, Group):
            names += operation.by + [a.column for a in operation.aggregates if a.column]
        elif isinstance(operation, Bin):
            names.append(operation.column)
        elif isinstance(operation, Unpivot):
            names += operation.columns
        elif isinstance(operation, SortRows):
            names += operation.by
    return names


def _run(rows: pd.DataFrame, operation: Any) -> pd.DataFrame:
    if isinstance(operation, Filter):
        return rows[_filter_mask(rows[operation.column], operation)]
    if isinstance(operation, Group):
        return _group(rows, operation)
    if isinstance(operation, Bin):
        return _bin(rows, operation)
    if isinstance(operation, Correlate):
        return _correlate(rows, operation.columns)
    if isinstance(operation, Unpivot):
        kept = [c for c in rows.columns if c not in operation.columns]
        return rows.melt(
            id_vars=kept,
            value_vars=operation.columns,
            var_name=operation.names_to,
            value_name=operation.values_to,
        )
    if isinstance(operation, SortRows):
        return rows.sort_values(operation.by, ascending=not operation.descending, kind="stable")
    return rows.head(operation.n)


def _filter_mask(values: pd.Series, operation: Filter) -> pd.Series:
    if operation.operator == "not_missing":
        return values.notna()
    targets = operation.value if isinstance(operation.value, list) else [operation.value]
    if pd.api.types.is_datetime64_any_dtype(values):
        targets = [pd.Timestamp(t).tz_localize(values.dt.tz) for t in targets]
    if operation.operator == "in":
        return values.isin(targets)
    return COMPARE[operation.operator](values, targets[0])


def _group(rows: pd.DataFrame, operation: Group) -> pd.DataFrame:
    keys = operation.by or [pd.Series(0, index=rows.index)]
    groups = rows.groupby(keys, sort=False, dropna=True)
    result = pd.DataFrame(index=groups.size().index)
    for aggregate in operation.aggregates:
        name = aggregate_name(aggregate)
        if aggregate.how == "count":
            result[name] = groups.size()
        else:
            result[name] = groups[aggregate.column].agg(aggregate.how)
    return result.reset_index(drop=not operation.by)


def _bin(rows: pd.DataFrame, operation: Bin) -> pd.DataFrame:
    values = rows[operation.column]
    dates = pd.api.types.is_datetime64_any_dtype(values)
    zone = values.dt.tz if dates else None
    if dates:
        # Dates with a time zone are binned by their local time.
        if zone is not None:
            values = values.dt.tz_localize(None)
        # Binned as microseconds: nanoseconds only reach the years 1677 to 2262.
        numbers = values.astype("datetime64[us]").astype("int64").to_numpy()
    else:
        numbers = values.to_numpy(dtype=float)
    count = _bin_count(numbers)
    if operation.bins is not None:
        count = min(count, operation.bins)
    edges = np.histogram_bin_edges(numbers, count) if len(numbers) else np.array([0.0, 1.0])
    index = np.clip(np.searchsorted(edges, numbers, side="right") - 1, 0, len(edges) - 2)
    start, end = edges[index], edges[index + 1]
    binned = rows.drop(columns=operation.column)
    if dates:
        start = pd.to_datetime(start.astype("int64"), unit="us").tz_localize(zone)
        end = pd.to_datetime(end.astype("int64"), unit="us").tz_localize(zone)
    binned[f"{operation.column}_start"] = np.asarray(start)
    binned[f"{operation.column}_end"] = np.asarray(end)
    return binned


def _bin_count(numbers: np.ndarray) -> int:
    """numpy's "auto" bin count (Freedman–Diaconis or Sturges), capped at `MAX_BINS`: "auto"
    alone makes millions of bins when one value lies far from the rest."""
    if len(numbers) == 0:
        return 1
    sturges = math.ceil(math.log2(len(numbers))) + 1
    span = float(numbers.max() - numbers.min())
    q1, q3 = np.percentile(numbers, [25, 75])
    width = 2 * float(q3 - q1) * len(numbers) ** (-1 / 3)
    freedman = math.ceil(span / width) if width > 0 else 0
    return min(max(sturges, freedman), MAX_BINS)


def _correlate(rows: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    names = list(dict.fromkeys(columns))
    correlations = rows[names].astype(float).corr()
    return pd.DataFrame(
        [
            {"x": x, "y": y, "correlation": round(float(correlations.loc[y, x]), 4)}
            for y in names
            for x in names
        ]
    )


def _drop_log_scales(
    chart: ChartDescription, frames: dict[str, pd.DataFrame], result: ChartResult
) -> ChartDescription:
    """`chart` without the log scales whose columns hold a value at or below 0."""
    kept = []
    for scale in chart.scales:
        if scale.type == "log" and any(
            (frames[dataset][column] <= 0).any()
            for dataset, column in scale_columns(chart, scale.scale)
            if pd.api.types.is_numeric_dtype(frames[dataset][column])
        ):
            result.ignored.append((f"Log scale for {scale.scale}", "it has values at or below 0"))
            continue
        kept.append(scale)
    return chart.model_copy(update={"scales": kept})


def _with_colour_domain(
    chart: ChartDescription, table: pd.DataFrame, frames: dict[str, pd.DataFrame]
) -> ChartDescription:
    """Sets a missing colour domain to the legend's text values, most frequent first."""
    found = colour_column(chart)
    if found is None or any(s.scale == "color" and s.domain for s in chart.scales):
        return chart
    dataset, column = found
    values = frames[dataset][column]
    if column_type(values) not in ("text", "boolean"):
        return chart
    source = (
        _as_categories(table[[column]], chart.categories)[column]
        if column in table.columns
        else values
    )
    order = [json_value(v) for v in source.dropna().value_counts().index]
    present = set(values.dropna().map(json_value))
    domain = [v for v in order if v in present]
    scales = [s for s in chart.scales if s.scale != "color"]
    colour = next((s for s in chart.scales if s.scale == "color"), None)
    if colour is None:
        colour = Scale(scale="color")
    colour = colour.model_copy(update={"domain": domain})
    return chart.model_copy(update={"scales": [*scales, colour]})


def _dataset_data(rows: pd.DataFrame) -> dict[str, Any]:
    return {
        "columns": [{"name": str(c), "type": column_type(rows[c])} for c in rows.columns],
        "rows": [[json_value(v) for v in row] for row in rows.itertuples(index=False)],
    }


def _fit(result: ChartResult, chart: ChartDescription, frames: dict[str, pd.DataFrame]) -> None:
    """Samples own-row datasets, the same way each time, until the chart fits, else unfits it."""
    datasets = result.data["datasets"]
    sampled = [d.name for d in chart.datasets if not is_summarized(d) and len(frames[d.name]) > 1]
    # Each pass scales every sample by the share over the limit, serialising once per pass.
    while len(json.dumps(result.data)) > MAX_BYTES:
        shrinking = [n for n in sampled if len(datasets[n]["rows"]) > 1]
        if not shrinking:
            break
        total = len(json.dumps(result.data))
        row_bytes = sum(len(json.dumps(datasets[n]["rows"])) for n in shrinking)
        scale = max(MAX_BYTES - (total - row_bytes), 0) / row_bytes
        for name in shrinking:
            size = max(1, int(len(datasets[name]["rows"]) * scale))
            _set_sample(datasets[name], frames[name], size)
    if len(json.dumps(result.data)) > MAX_BYTES:
        result.fits = False
        result.notes.append("it has too many values to draw, so it is described in text below")
        return
    for name in sampled:
        sample = datasets[name].get("sample")
        if sample:
            _note(result, f"a sample of {sample['shown']:,} of {sample['total']:,} points is shown")
            for mark in chart.marks:
                if mark.dataset == name and mark.mark in STATISTICAL_MARKS:
                    _note(result, f"its {mark.mark} mark is drawn from that sample")


def _set_sample(data: dict[str, Any], rows: pd.DataFrame, size: int) -> None:
    """Keeps a sample of `size` rows in table order, recording it so its bytes are counted."""
    shown = rows.sample(size, random_state=0).sort_index() if size < len(rows) else rows
    data["rows"] = [[json_value(v) for v in row] for row in shown.itertuples(index=False)]
    data["sample"] = {"shown": len(shown), "total": len(rows)}


def chart_text(data: dict[str, Any], choice: ChartChoice) -> str:
    """The title, the template with its slots and style, and each dataset's rows."""
    lines = [data["title"], choice_text(choice)]
    for name, dataset in data["datasets"].items():
        rows = len(dataset["rows"])
        columns = ", ".join(c["name"] for c in dataset["columns"])
        held = f"{rows:,} row{'s' if rows != 1 else ''} of {columns}"
        if "sample" in dataset:
            held += f", a sample of {dataset['sample']['total']:,}"
        lines.append(f'Data "{name}": {held}.')
    return "\n".join(lines)
