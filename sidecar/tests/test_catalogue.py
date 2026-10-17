from mini_me_sidecar.adapters.data.catalogue import CheckPlan, InRange, Matches, NotNull, problem

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
