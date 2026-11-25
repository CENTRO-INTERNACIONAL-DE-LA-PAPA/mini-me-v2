from chart_builders import chart, dataset, mark, scale

from mini_me_sidecar.adapters.data.charts import check_chart

TYPES = {"yield": "number", "variety": "text", "day": "date", "ok": "boolean"}


def reasons(checked) -> dict[str, str]:
    return dict(checked.ignored)


def test_operations_are_checked_against_the_columns_as_they_stand():
    def problem(*operations) -> str | None:
        checked = check_chart(chart([dataset("d", *operations)], [mark("dot", "d")]), TYPES)
        return reasons(checked).get('dataset "d"')

    mean = {"kind": "group", "by": ["variety"], "aggregates": [
        {"how": "mean", "column": "yield", "name": None}]}
    assert problem(mean, {"kind": "sort", "by": ["mean_yield"], "descending": True}) is None
    by_yield = {"kind": "sort", "by": ["yield"], "descending": True}
    assert "no column `yield`" in problem(mean, by_yield)
    assert "needs numbers" in problem({"kind": "group", "by": [], "aggregates": [
        {"how": "sum", "column": "variety", "name": None}]})
    assert "not numbers or dates" in problem({"kind": "bin", "column": "variety", "bins": None})
    assert "at least 2" in problem({"kind": "correlate", "columns": ["yield"]})
    assert "not a number" in problem(
        {"kind": "filter", "column": "yield", "operator": ">", "value": "high"})
    assert "by order" in problem(
        {"kind": "filter", "column": "variety", "operator": "<", "value": "a"})
    assert problem({"kind": "bin", "column": "day", "bins": 10},
                   {"kind": "group", "by": ["day_start", "day_end"], "aggregates": [
                       {"how": "count", "column": None, "name": None}]}) is None


def test_marks_need_a_valid_dataset_mark_and_columns():
    means = dataset("means", {"kind": "group", "by": ["variety"], "aggregates": [
        {"how": "mean", "column": "yield", "name": None}]})
    rows = dataset("rows")
    checked = check_chart(chart([means, rows], [
        mark("barY", "means", x="variety", y="mean_yield"),
        mark("geo", "rows"),
        mark("dot", "rows", x="yield", y="heigth"),
        mark("boxY", "means", y="mean_yield"),
        mark("dot", "missing", x="yield"),
        mark("ruleY", None),
        mark("ruleY", None, [5], stroke=("value", "red; fill")),
    ]), TYPES)
    assert [m.mark for m in checked.chart.marks] == ["barY", "ruleY"]
    assert checked.chart.marks[1].channels == []
    assert [d.name for d in checked.chart.datasets] == ["means"]
    found = reasons(checked)
    assert "not a mark" in found["geo()"]
    assert found["dot(yield, heigth)"] == "no column `heigth`"
    assert "own rows" in found["boxY(mean_yield)"]
    assert "no valid dataset" in found["dot(yield)"]
    assert "no dataset or values" in found["ruleY()"]
    assert "not a colour" in found["ruleY channel stroke"]

    checked = check_chart(chart([rows], [mark("geo", "rows")]), TYPES)
    assert checked.chart is None and 'chart "t"' in reasons(checked)


def test_scales_keep_known_schemes_and_heights_stay_in_range():
    marks = [mark("dot", "d", x="yield")]
    scales = [scale("color", scheme="Viridis"), scale("x", scheme="rainbowz")]
    described = chart([dataset("d")], marks, scales)
    described.height = 5000
    checked = check_chart(described, TYPES)
    assert [s.scheme for s in checked.chart.scales] == ["Viridis", None]
    assert checked.chart.height == 800
    assert "scheme rainbowz" in reasons(checked)

