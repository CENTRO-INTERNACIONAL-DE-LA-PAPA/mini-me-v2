from mini_me_sidecar.adapters.data.catalogue import (
    Chart,
    CheckPlan,
    InRange,
    Matches,
    NotNull,
    chart_problem,
    problem,
)

COLUMNS = ["plot_id", "yield"]


def test_unknown_columns_and_bad_parameters_are_problems():
    assert problem(NotNull(kind="not_null", columns=["yeild"]), COLUMNS) == "no column `yeild`"
    assert problem(InRange(kind="in_range", column="yield", min=80, max=0), COLUMNS)
    assert problem(Matches(kind="matches", column="plot_id", pattern="("), COLUMNS)
    assert problem(InRange(kind="in_range", column="yield", min=0, max=80), COLUMNS) is None


def test_plan_parses_entries_by_kind():
    checks = [
        {"kind": "unique", "columns": ["plot_id"]},
        {"kind": "not_null", "columns": ["yield"]},
    ]
    plan = CheckPlan.model_validate({"checks": checks})
    assert [c.kind for c in plan.checks] == ["unique", "not_null"]


TYPES = {"yield": "number", "variety": "text", "date": "date"}


def chart(type: str, **fields) -> Chart:
    empty = {"x": None, "y": None, "columns": [], "series": None, "aggregate": None}
    return Chart(type=type, title="", alternatives=[], **{**empty, **fields})


def test_charts_need_columns_of_the_right_type():
    assert "text column" in chart_problem(chart("histogram", x="variety"), TYPES)
    assert chart_problem(chart("bar", x="variety", aggregate="count"), TYPES) is None
    assert chart_problem(chart("bar", x="variety", aggregate="mean"), TYPES) == "no `y` column given"
    assert "at least 2" in chart_problem(chart("heatmap", columns=["yield"]), TYPES)
    assert chart_problem(chart("scatter", x="yield", y="heigth"), TYPES) == "no column `heigth`"
