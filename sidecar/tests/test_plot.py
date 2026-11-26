import json

import numpy as np
import pandas as pd
from chart_builders import chart, dataset, mark

from mini_me_sidecar.adapters.data.plot import MAX_BINS, MAX_BYTES, build_chart

COUNT = {"how": "count", "column": None, "name": None}


def draw(frame: pd.DataFrame, datasets, marks, scales=()):
    return build_chart(frame, chart(datasets, marks, scales))


def rows(result, name: str = "d") -> list[dict]:
    data = result.data["datasets"][name]
    names = [c["name"] for c in data["columns"]]
    return [dict(zip(names, row)) for row in data["rows"]]


def histogram(column: str, bins=None) -> dict:
    return dataset(
        "d",
        {"kind": "bin", "column": column, "bins": bins},
        {"kind": "group", "by": [f"{column}_start", f"{column}_end"], "aggregates": [COUNT]},
    )


def bars(column: str) -> list[dict]:
    return [mark("rectY", "d", x1=f"{column}_start", x2=f"{column}_end", y="count")]


def test_a_histogram_counts_every_value_and_reports_missing_rows():
    frame = pd.DataFrame({"yield": [1.0, 2, 2, 3, None, 9]})
    result = draw(frame, [histogram("yield")], bars("yield"))
    assert sum(r["count"] for r in rows(result)) == 5
    assert result.notes == ["1 row with missing values was left out"]

    values = np.append(np.random.default_rng(2).normal(scale=1e-6, size=1000), 1e6)
    result = draw(pd.DataFrame({"x": values}), [histogram("x")], bars("x"))
    assert len(rows(result)) <= MAX_BINS


def test_dates_are_binned_with_or_without_a_zone_and_beyond_2262():
    for days in (
        pd.to_datetime(["2024-01-01", "2024-03-01"]).tz_localize("UTC"),
        np.array(["2500-01-01", "2500-06-01"], dtype="datetime64[s]"),
    ):
        result = draw(pd.DataFrame({"day": days}), [histogram("day")], bars("day"))
        assert rows(result)[0]["day_start"][:10] in ("2024-01-01", "2500-01-01")


def test_own_rows_are_kept_while_they_fit_and_sampled_the_same_way_after():
    rng = np.random.default_rng(1)
    small = pd.DataFrame({"x": rng.normal(size=12000), "y": rng.normal(size=12000)})
    result = draw(small, [dataset("d")], [mark("dot", "d", x="x", y="y")])
    assert len(rows(result)) == 12000 and "sample" not in result.data["datasets"]["d"]

    large = pd.DataFrame({"x": rng.normal(size=120000), "y": rng.normal(size=120000)})
    marks = [mark("dot", "d", x="x", y="y"), mark("boxY", "d", y="y")]
    first, second = (draw(large, [dataset("d")], marks) for _ in range(2))
    sample = first.data["datasets"]["d"]["sample"]
    assert sample["total"] == 120000 and sample["shown"] < 120000
    assert len(json.dumps(first.data)) <= MAX_BYTES
    assert rows(first) == rows(second)

    plots = [f"plot-{i:06d}-" + "x" * 60 for i in range(40000)]
    frame = pd.DataFrame({"plot": plots, "yield": range(40000)})
    grouped = dataset("d", {"kind": "group", "by": ["plot"], "aggregates": [COUNT]})
    result = draw(frame, [grouped], [mark("barY", "d", x="plot", y="count")])
    assert not result.fits

