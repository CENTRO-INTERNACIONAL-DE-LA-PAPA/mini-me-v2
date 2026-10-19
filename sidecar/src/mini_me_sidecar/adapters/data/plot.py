"""Plot: the values each chart type needs, computed with pandas, as the views of a `chart`
Interactive Component, and its plain-text alternative. Only what a chart draws is sent: bins,
aggregates, box statistics, correlations, or the points of a line or scatter chart. Every
series, category and outlier is kept; only points are sampled, and only when a chart would
not fit the core's size limit."""

import json
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from mini_me_sidecar.adapters.data.catalogue import Chart, chart_problem
from mini_me_sidecar.adapters.data.preview import json_value

# The core refuses component data larger than 2 MiB; this leaves room for the title and the
# JSON the core wraps around it.
MAX_BYTES = 2_000_000

KIND_NAMES = {
    "histogram": "Histogram",
    "bar": "Bar chart",
    "line": "Line chart",
    "scatter": "Scatter chart",
    "box": "Box plot",
    "heatmap": "Correlation heatmap",
}


@dataclass
class ChartResult:
    """A chart's component data, and what the reply says about how it was drawn."""

    data: dict[str, Any]
    notes: list[str] = field(default_factory=list)


def as_type(chart: Chart, kind: str) -> Chart:
    """`chart` drawn as another type with the same columns. A histogram's values and series
    become a box or bar chart's `y` and groups, and the other way round; other types keep
    their fields."""
    update: dict[str, Any] = {"type": kind}
    if chart.type == "histogram" and kind in ("box", "bar"):
        update |= {"x": chart.series, "y": chart.x, "series": None}
    elif chart.type in ("box", "bar") and kind == "histogram":
        update |= {"x": chart.y, "series": chart.x}
    if kind == "bar" and update.get("y", chart.y) and chart.aggregate in (None, "count"):
        update["aggregate"] = "mean"
    return chart.model_copy(update=update)


def chart_views(chart: Chart, types: dict[str, str]) -> list[Chart]:
    """The chart itself and its valid alternatives, each type once. `chart` must already be
    valid."""
    views = [chart]
    for kind in chart.alternatives:
        if any(v.type == kind for v in views):
            continue
        alternative = as_type(chart, kind)
        if chart_problem(alternative, types) is None:
            views.append(alternative)
    return views


def build_chart(frame: pd.DataFrame, chart: Chart, types: dict[str, str]) -> ChartResult:
    """The component data of a valid chart with its alternative views."""
    result = ChartResult({"title": chart.title or _default_title(chart), "views": []})
    sampled: list[tuple[dict[str, Any], pd.DataFrame]] = []
    for view in chart_views(chart, types):
        data, notes, points = _view(frame, view, types)
        result.data["views"].append(data)
        result.notes.extend(n for n in notes if n not in result.notes)
        if points is not None:
            sampled.append((data, points))
    _fit(result, sampled)
    return result


def _fit(result: ChartResult, sampled: list[tuple[dict[str, Any], pd.DataFrame]]) -> None:
    """Samples the points of line and scatter views, halving the largest view's sample, until
    the chart fits `MAX_BYTES`, and notes each view that was sampled. The same table always
    gives the same sample."""
    while sampled and len(json.dumps(result.data)) > MAX_BYTES:
        view, points = max(sampled, key=lambda s: len(s[0]["points"]))
        if len(view["points"]) <= 1:
            break
        _set_points(view, points, len(view["points"]) // 2)
    for view, points in sampled:
        if len(view["points"]) < len(points):
            view["sample"] = {"shown": len(view["points"]), "total": len(points)}
            note = f"a sample of {len(view['points']):,} of {len(points):,} points is shown"
            if note not in result.notes:
                result.notes.append(note)


def _set_points(view: dict[str, Any], points: pd.DataFrame, size: int) -> None:
    shown = points.sample(size, random_state=0) if size < len(points) else points
    if view["type"] == "line":
        shown = shown.sort_values("x", kind="stable")
    view["points"] = [_point(row) for row in shown.itertuples(False)]


def chart_text(data: dict[str, Any]) -> str:
    """One line per view, for history and app versions without the kind."""
    return "\n".join([data["title"], *(_view_text(v) for v in data["views"])])


def _view(
    frame: pd.DataFrame, chart: Chart, types: dict[str, str]
) -> tuple[dict[str, Any], list[str], pd.DataFrame | None]:
    """A view's data, what the reply says about it, and for line and scatter views all their
    points, which `_fit` may sample."""
    if chart.type == "heatmap":
        return _heatmap(frame, chart), [], None
    used = [c for c in (chart.x, chart.y, chart.series) if c]
    if chart.type == "bar" and chart.aggregate in (None, "count"):
        used = [c for c in (chart.x, chart.series) if c]
    rows = frame[list(dict.fromkeys(used))].dropna()
    notes = []
    dropped = len(frame) - len(rows)
    if dropped:
        notes.append(
            f"1 row with missing values was left out"
            if dropped == 1
            else f"{dropped:,} rows with missing values were left out"
        )
    view: dict[str, Any] = {"type": chart.type}
    for axis in ("x", "y"):
        column = getattr(chart, axis)
        if column and not (axis == "y" and chart.type == "histogram"):
            view[axis] = {"name": column, "type": types[column]}
    series: pd.Series | None = None
    if chart.series and chart.type != "box":
        series = rows[chart.series].astype(str)
        view["series_column"] = chart.series
        view["series"] = _series_order(series)
    if chart.type == "histogram":
        view["bins"] = _histogram(rows[chart.x], series)
    elif chart.type == "bar":
        view["aggregate"] = chart.aggregate or "count"
        view["bars"] = _bars(rows, chart, series)
    elif chart.type == "box":
        view["groups"] = _box(rows[chart.x], rows[chart.y])
    else:
        if chart.type == "line":
            view["aggregate"] = chart.aggregate or "mean"
        points = _points(rows, chart, series)
        _set_points(view, points, len(points))
        return view, notes, points
    return view, notes, None


def _series_order(series: pd.Series) -> list[str]:
    """Series values from most to least frequent."""
    return series.value_counts().index.tolist()


def _histogram(values: pd.Series, series: pd.Series | None) -> list[dict[str, Any]]:
    dates = pd.api.types.is_datetime64_any_dtype(values)
    # Dates are binned as nanoseconds, whatever resolution pandas read them in.
    numbers = (
        values.astype("datetime64[ns]").astype("int64").to_numpy()
        if dates
        else values.to_numpy(dtype=float)
    )
    edges = np.histogram_bin_edges(numbers, "auto")

    def edge(value: float) -> Any:
        return json_value(pd.Timestamp(int(value))) if dates else json_value(float(value))

    groups = [(None, numbers)]
    if series is not None:
        groups = [(name, numbers[(series == name).to_numpy()]) for name in _series_order(series)]
    bins = []
    for name, group in groups:
        counts, _ = np.histogram(group, edges)
        for x0, x1, count in zip(edges[:-1], edges[1:], counts):
            entry: dict[str, Any] = {"x0": edge(x0), "x1": edge(x1), "count": int(count)}
            if name is not None:
                entry["series"] = name
            bins.append(entry)
    return bins


def _aggregate(values: Any, how: str) -> pd.Series:
    """A grouped series' size or aggregate."""
    return values.size() if how == "count" else values.agg(how)


def _bars(rows: pd.DataFrame, chart: Chart, series: pd.Series | None) -> list[dict[str, Any]]:
    how = chart.aggregate or "count"
    category = rows[chart.x].astype(str)
    target = rows[chart.y] if how != "count" else pd.Series(1, index=rows.index)
    totals = _aggregate(target.groupby(category), how).sort_values(ascending=False)
    order = totals.index.tolist()
    keys = [category] if series is None else [category, series]
    values = _aggregate(target.groupby(keys), how)
    bars = []
    for key, value in values.items():
        x, name = (key, None) if series is None else key
        entry: dict[str, Any] = {"x": x, "y": json_value(value)}
        if name is not None:
            entry["series"] = name
        bars.append(entry)
    bars.sort(key=lambda b: order.index(b["x"]))
    return bars


def _box(groups: pd.Series, values: pd.Series) -> list[dict[str, Any]]:
    labels = groups.astype(str)
    result = []
    for name in labels.value_counts().index:
        group = values[labels == name].astype(float)
        q1, median, q3 = (float(v) for v in group.quantile([0.25, 0.5, 0.75]))
        reach = 1.5 * (q3 - q1)
        inside = group[(group >= q1 - reach) & (group <= q3 + reach)]
        outside = group[(group < q1 - reach) | (group > q3 + reach)]
        result.append(
            {
                "group": name,
                "q1": json_value(q1),
                "median": json_value(median),
                "q3": json_value(q3),
                "low": json_value(inside.min()),
                "high": json_value(inside.max()),
                "count": len(group),
                "outliers": sorted(json_value(v) for v in outside),
            }
        )
    return result


def _points(rows: pd.DataFrame, chart: Chart, series: pd.Series | None) -> pd.DataFrame:
    points = pd.DataFrame({"x": rows[chart.x], "y": rows[chart.y]})
    if series is not None:
        points["series"] = series
    if chart.type == "line":
        keys = ["x", "series"] if series is not None else ["x"]
        points = _aggregate(points.groupby(keys)["y"], chart.aggregate or "mean")
        points = points.rename("y").reset_index()
    return points[[c for c in ("x", "y", "series") if c in points]]


def _point(row: tuple) -> dict[str, Any]:
    point = {"x": json_value(row[0]), "y": json_value(row[1])}
    if len(row) > 2:
        point["series"] = row[2]
    return point


def _heatmap(frame: pd.DataFrame, chart: Chart) -> dict[str, Any]:
    columns = list(dict.fromkeys(chart.columns))
    correlations = frame[columns].astype(float).corr()
    cells = [
        {"x": x, "y": y, "value": json_value(round(float(correlations.loc[y, x]), 4))}
        for y in columns
        for x in columns
    ]
    return {"type": "heatmap", "columns": columns, "cells": cells}


def _default_title(chart: Chart) -> str:
    return _view_title(
        {"type": chart.type, "x": {"name": chart.x}, "y": {"name": chart.y},
         "series_column": chart.series, "columns": chart.columns,
         "aggregate": chart.aggregate}
    )


def _view_title(view: dict[str, Any]) -> str:
    kind = view["type"]
    x = (view.get("x") or {}).get("name")
    y = (view.get("y") or {}).get("name")
    by = f" by {view['series_column']}" if view.get("series_column") else ""
    if kind == "heatmap":
        return f"{KIND_NAMES[kind]} of " + ", ".join(view.get("columns") or [])
    if kind == "histogram":
        return f"{KIND_NAMES[kind]} of {x}{by}"
    if kind == "bar":
        how = view.get("aggregate") or "count"
        measure = "count of rows" if how == "count" or not y else f"{how} {y}"
        return f"{KIND_NAMES[kind]} of {measure} by {x}" + (
            f" and {view['series_column']}" if by else ""
        )
    if kind == "box":
        return f"{KIND_NAMES[kind]} of {y} by {x}"
    if kind == "line":
        return f"{KIND_NAMES[kind]} of {view.get('aggregate') or 'mean'} {y} over {x}{by}"
    return f"{KIND_NAMES[kind]} of {y} against {x}{by}"


def _view_text(view: dict[str, Any]) -> str:
    title = _view_title(view)
    kind = view["type"]
    if kind == "histogram":
        bins = view["bins"]
        edges = {b["x0"] for b in bins}
        total = sum(b["count"] for b in bins)
        return (
            f"{title}: {len(edges)} bins, {total:,} values from {_num(bins[0]['x0'])} "
            f"to {_num(bins[-1]['x1'])}"
        )
    if kind == "bar":
        shown = ", ".join(
            f"{b['x']}{' (' + b['series'] + ')' if 'series' in b else ''} {_num(b['y'])}"
            for b in view["bars"][:10]
        )
        more = f", and {len(view['bars']) - 10} more" if len(view["bars"]) > 10 else ""
        return f"{title}: {shown}{more}"
    if kind == "box":
        shown = ", ".join(f"{g['group']} median {_num(g['median'])}" for g in view["groups"][:10])
        return f"{title}: {shown}"
    if kind == "heatmap":
        pairs = [
            f"{c['y']}–{c['x']} {_num(c['value'])}"
            for c in view["cells"]
            if view["columns"].index(c["x"]) > view["columns"].index(c["y"])
        ]
        return f"{title}: " + ", ".join(pairs[:15])
    points = view["points"]
    text = f"{title}: {len(points):,} points"
    if "sample" in view:
        text += f" (a sample of {view['sample']['total']:,})"
    if kind == "line" and points:
        text += f" from {_num(points[0]['x'])} to {_num(points[-1]['x'])}"
    return text


def _num(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:,.4g}" if abs(value) < 1e6 else f"{value:,.0f}"
    if isinstance(value, int) and not isinstance(value, bool):
        return f"{value:,}"
    return str(value)
