import json

import numpy as np
import pandas as pd

from mini_me_sidecar.adapters.data.catalogue import Chart
from mini_me_sidecar.adapters.data.plot import MAX_BINS, MAX_BYTES, build_chart, chart_text
from mini_me_sidecar.adapters.data.tables import column_type


def chart(type: str, **fields) -> Chart:
    empty = {"x": None, "y": None, "columns": [], "series": None, "aggregate": None}
    return Chart(type=type, title="", alternatives=[], **{**empty, **fields})


def draw(frame: pd.DataFrame, c: Chart):
    types = {str(name): column_type(frame[name]) for name in frame.columns}
    return build_chart(frame, c, types)


def test_histogram_counts_every_value_and_reports_missing_rows():
    frame = pd.DataFrame({"yield": [1.0, 2, 2, 3, None, 9]})
    result = draw(frame, chart("histogram", x="yield"))
    bins = result.data["views"][0]["bins"]
    assert sum(b["count"] for b in bins) == 5
    assert result.notes == ["1 row with missing values was left out"]


def test_bar_mean_keeps_every_category_largest_first():
    frame = pd.DataFrame({"plot": [f"p{i}" for i in range(35)], "yield": range(35)})
    result = draw(frame, chart("bar", x="plot", y="yield", aggregate="mean"))
    bars = result.data["views"][0]["bars"]
    assert len(bars) == 35
    assert (bars[0], bars[-1]) == ({"x": "p34", "y": 34.0}, {"x": "p0", "y": 0.0})
    assert result.notes == []


def test_every_series_is_kept_most_frequent_first():
    sites = [f"s{i}" for i in range(9) for _ in range(9 - i)]
    frame = pd.DataFrame({"site": sites, "yield": range(len(sites))})
    view = draw(frame, chart("histogram", x="yield", series="site")).data["views"][0]
    assert view["series"] == [f"s{i}" for i in range(9)]


def test_box_quartiles_and_outliers():
    frame = pd.DataFrame({"v": ["a"] * 9, "yield": [1, 2, 3, 4, 5, 6, 7, 8, 100]})
    group = draw(frame, chart("box", x="v", y="yield")).data["views"][0]["groups"][0]
    assert (group["q1"], group["median"], group["q3"]) == (3.0, 5.0, 7.0)
    assert (group["low"], group["high"], group["outliers"]) == (1.0, 8.0, [100.0])


def test_heatmap_holds_every_pair_with_ones_on_the_diagonal():
    frame = pd.DataFrame({"a": [1.0, 2, 3, 4], "b": [2.0, 4, 6, 9], "c": [4.0, 3, 2, 1]})
    view = draw(frame, chart("heatmap", columns=["a", "b", "c"])).data["views"][0]
    assert len(view["cells"]) == 9
    assert all(c["value"] == 1 for c in view["cells"] if c["x"] == c["y"])


def test_scatter_keeps_every_point_that_fits_and_samples_the_same_way():
    rng = np.random.default_rng(1)
    small = pd.DataFrame({"x": rng.normal(size=12000), "y": rng.normal(size=12000)})
    view = draw(small, chart("scatter", x="x", y="y")).data["views"][0]
    assert len(view["points"]) == 12000 and "sample" not in view

    large = pd.DataFrame({"x": rng.normal(size=120000), "y": rng.normal(size=120000)})
    first, second = (draw(large, chart("scatter", x="x", y="y")) for _ in range(2))
    view = first.data["views"][0]
    assert view["sample"]["total"] == 120000 and view["sample"]["shown"] < 120000
    assert len(json.dumps(first.data)) <= MAX_BYTES
    assert view["points"] == second.data["views"][0]["points"]
    assert f"a sample of {view['sample']['shown']:,} of 120,000 points is shown" in first.notes


def test_alternatives_become_views_with_remapped_columns():
    frame = pd.DataFrame({"variety": ["a", "a", "b", "b"], "yield": [1.0, 2, 3, 4]})
    c = chart("histogram", x="yield", series="variety")
    c.alternatives = ["box", "scatter"]
    views = draw(frame, c).data["views"]
    assert [v["type"] for v in views] == ["histogram", "box"]
    assert (views[1]["x"]["name"], views[1]["y"]["name"]) == ("variety", "yield")


def test_text_describes_each_view():
    frame = pd.DataFrame({"variety": ["a", "a", "b"], "yield": [1.0, 2, 4]})
    data = draw(frame, chart("histogram", x="yield", series="variety")).data
    assert chart_text(data).startswith("Histogram of yield by variety\nHistogram of yield")
    assert "3 values from 1 to 4" in chart_text(data)

    data = {"title": "t", "views": [{
        "type": "scatter", "x": {"name": "x"}, "y": {"name": "y"},
        "points": [{"x": 1, "y": 2}], "sample": {"shown": 1, "total": 6000},
    }]}
    assert "1 points (a sample of 6,000)" in chart_text(data)


def test_dates_are_binned_and_lines_aggregate_per_series():
    days = pd.to_datetime(["2024-01-01", "2024-01-05", "2024-02-01", "2024-02-01"])
    frame = pd.DataFrame({"day": days, "yield": [1.0, 2, 3, 5], "t": ["a", "b", "a", "a"]})
    bins = draw(frame, chart("histogram", x="day")).data["views"][0]["bins"]
    assert bins[0]["x0"] == "2024-01-01"
    points = draw(frame, chart("line", x="day", y="yield", series="t")).data["views"][0]["points"]
    assert points[-1] == {"x": "2024-02-01", "y": 4.0, "series": "a"}


def test_only_the_columns_a_chart_type_reads_are_read():
    frame = pd.DataFrame({"variety": ["a", "a", "b"], "yield": [1.0, 2, 4], "note": [None] * 3})
    histogram = draw(frame, chart("histogram", x="yield", y="nope"))
    assert sum(b["count"] for b in histogram.data["views"][0]["bins"]) == 3
    box = draw(frame, chart("box", x="variety", y="yield", series="note"))
    assert box.notes == [] and len(box.data["views"][0]["groups"]) == 2
    bar = draw(frame, chart("bar", x="variety", y="nope", aggregate="count")).data["views"][0]
    assert "y" not in bar and bar["bars"][0] == {"x": "a", "y": 2}


def test_dates_with_a_time_zone_or_beyond_2262_are_binned():
    def first_edge(days) -> str:
        bins = draw(pd.DataFrame({"day": days}), chart("histogram", x="day")).data["views"][0]
        return bins["bins"][0]["x0"]

    assert first_edge(pd.to_datetime(["2024-01-01", "2024-03-01"]).tz_localize("UTC")) == (
        "2024-01-01"
    )
    assert first_edge(np.array(["2500-01-01", "2500-06-01"], dtype="datetime64[s]")) == (
        "2500-01-01"
    )


def test_a_histogram_has_a_bounded_number_of_bins():
    values = np.append(np.random.default_rng(2).normal(scale=1e-6, size=1000), 1e6)
    bins = draw(pd.DataFrame({"x": values}), chart("histogram", x="x")).data["views"][0]["bins"]
    assert len(bins) <= MAX_BINS


def test_views_too_large_to_draw_are_left_out_or_described_in_text():
    plots = [f"plot-{i:05d}-" + "x" * 40 for i in range(13000)]
    frame = pd.DataFrame({"plot": plots, "yield": range(13000)})
    c = chart("bar", x="plot", y="yield", aggregate="mean")
    c.alternatives = ["box"]
    result = draw(frame, c)
    assert result.fits and [v["type"] for v in result.data["views"]] == ["bar"]
    assert result.notes == ["the box plot view was left out, as it has too many values"]

    wide = pd.DataFrame(np.random.default_rng(3).normal(size=(5, 300)))
    wide.columns = [f"c{i:03d}" for i in range(300)]
    result = draw(wide, chart("heatmap", columns=list(wide.columns)))
    assert not result.fits
    assert result.notes == ["it has too many columns to draw, so it is described in text below"]
