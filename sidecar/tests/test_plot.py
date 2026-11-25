import json

import numpy as np
import pandas as pd
from chart_builders import chart, dataset, mark, scale

from mini_me_sidecar.adapters.data.plot import MAX_BINS, MAX_BYTES, build_chart, chart_text
from mini_me_sidecar.adapters.data.templates import ChartChoice, fill_template

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


def test_groups_hold_every_category_and_only_the_shown_columns():
    frame = pd.DataFrame(
        {"variety": ["a", "a", "b"], "yield": [1.0, 3, 4], "note": [None] * 3, "site": ["x"] * 3}
    )
    means = dataset(
        "d",
        {"kind": "group", "by": ["variety"], "aggregates": [
            {"how": "mean", "column": "yield", "name": None}, COUNT]},
        {"kind": "sort", "by": ["mean_yield"], "descending": True},
    )
    result = draw(frame, [means], [mark("barY", "d", x="variety", y="mean_yield")])
    assert rows(result) == [
        {"variety": "b", "mean_yield": 4.0},
        {"variety": "a", "mean_yield": 2.0},
    ]
    assert result.notes == []


def test_correlations_unpivot_and_filters():
    frame = pd.DataFrame({"a": [1.0, 2, 3, 4], "b": [2.0, 4, 6, 9], "c": [4.0, 3, 2, 1]})
    pairs = dataset("d", {"kind": "correlate", "columns": ["a", "b", "c"]})
    result = draw(frame, [pairs], [mark("cell", "d", x="x", y="y", fill="correlation")])
    assert len(rows(result)) == 9
    assert all(r["correlation"] == 1 for r in rows(result) if r["x"] == r["y"])

    long = dataset(
        "d",
        {"kind": "filter", "column": "a", "operator": ">=", "value": 3},
        {"kind": "unpivot", "columns": ["b", "c"], "names_to": "name", "values_to": "value"},
    )
    result = draw(frame, [long], [mark("dot", "d", x="a", y="value", fill="name")])
    assert rows(result)[0] == {"a": 3.0, "value": 6.0, "name": "b"}
    assert len(rows(result)) == 4


def test_dates_are_binned_with_or_without_a_zone_and_beyond_2262():
    for days in (
        pd.to_datetime(["2024-01-01", "2024-03-01"]).tz_localize("UTC"),
        np.array(["2500-01-01", "2500-06-01"], dtype="datetime64[s]"),
    ):
        result = draw(pd.DataFrame({"day": days}), [histogram("day")], bars("day"))
        assert rows(result)[0]["day_start"][:10] in ("2024-01-01", "2500-01-01")


def test_the_legend_lists_text_values_most_frequent_first():
    sites = [f"s{i}" for i in range(9) for _ in range(9 - i)]
    frame = pd.DataFrame({"site": sites, "yield": range(len(sites))})
    result = draw(frame, [dataset("d")], [mark("dot", "d", x="yield", y="yield", fill="site")])
    colour = next(s for s in result.data["description"]["scales"] if s["scale"] == "color")
    assert colour["domain"] == [f"s{i}" for i in range(9)]


def test_a_log_scale_over_values_at_or_below_zero_is_ignored():
    frame = pd.DataFrame({"x": [0.0, 1, 2], "y": [1.0, 2, 3]})
    marks = [mark("dot", "d", x="x", y="y")]
    result = draw(frame, [dataset("d")], marks, [scale("x", type="log"), scale("y", type="log")])
    assert [s["scale"] for s in result.data["description"]["scales"]] == ["y"]
    assert [label for label, _ in result.ignored] == ["Log scale for x"]


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
    assert f"a sample of {sample['shown']:,} of 120,000 points is shown" in first.notes
    assert "its boxY mark is drawn from that sample" in first.notes


def test_a_summarized_dataset_too_large_is_described_in_text():
    plots = [f"plot-{i:06d}-" + "x" * 60 for i in range(40000)]
    frame = pd.DataFrame({"plot": plots, "yield": range(40000)})
    grouped = dataset("d", {"kind": "group", "by": ["plot"], "aggregates": [COUNT]})
    result = draw(frame, [grouped], [mark("barY", "d", x="plot", y="count")])
    assert not result.fits
    assert result.notes == ["it has too many values to draw, so it is described in text below"]


def test_text_names_the_template_slots_style_and_rows():
    frame = pd.DataFrame({"variety": ["a", "a", "b"], "yield": [1.0, 2, 4]})
    choice = ChartChoice(
        template="bar", title="t", category="variety", value="yield", log_y=True, reference=2.5
    )
    chart, _ = fill_template(choice, frame)
    result = build_chart(frame, chart)
    assert chart_text(result.data, choice).splitlines() == [
        "t",
        "Chart template bar: category variety, value yield, aggregate mean. "
        "Style: log y, reference line at 2.5.",
        'Data "bars": 2 rows of variety, mean_yield.',
    ]
