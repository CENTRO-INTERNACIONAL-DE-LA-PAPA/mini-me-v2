import pandas as pd

from mini_me_sidecar.adapters.data.catalogue import (
    InRange,
    Matches,
    NotNull,
    pick_columns,
    problem,
    role_problem,
)

COLUMNS = ["plot_id", "yield"]


def test_unknown_columns_and_bad_parameters_are_problems():
    assert problem(NotNull(kind="not_null", columns=["yeild"]), COLUMNS) == "no column `yeild`"
    assert problem(InRange(kind="in_range", column="yield", min=80, max=0), COLUMNS)
    assert problem(Matches(kind="matches", column="plot_id", pattern="("), COLUMNS)
    assert problem(InRange(kind="in_range", column="yield", min=0, max=80), COLUMNS) is None


def test_columns_are_the_named_ones_that_fit_or_every_fitting_one():
    frame = pd.DataFrame({"plot_id": ["a", "b"], "yield": [1.0, 2.0], "height": [3, 4]})
    assert pick_columns(frame, [], ("number",)) == (["yield", "height"], [])
    picked, left_out = pick_columns(frame, ["yield", "plot_id", "yeild"], ("number",))
    assert picked == ["yield"]
    assert left_out == [
        ("Column `plot_id`", "it is a text column, not number"),
        ("Column `yeild`", "the table has no such column"),
    ]


def test_a_role_needs_a_column_of_its_kinds():
    frame = pd.DataFrame({"variety": ["a", "b"], "yield": [1.0, 2.0]})
    assert role_problem(frame, "yield", "outcome", ("number",)) is None
    assert role_problem(frame, "variety", "outcome", ("number",)) == (
        "`variety` is a text column, and the outcome needs number."
    )
    assert "no column `yeild`" in role_problem(frame, "yeild", "outcome", ("number",))

