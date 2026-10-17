import pandas as pd

from mini_me_sidecar.adapters.data.catalogue import HasType, InRange, Unique
from mini_me_sidecar.adapters.data.validate import run_checks


def test_defaults_and_chosen_checks():
    frame = pd.DataFrame(
        {"plot_id": [1, 2, 2, 3], "yield": [10.0, 90.0, 90.0, 5.0], "empty": [None] * 4}
    )
    checks = [
        Unique(kind="unique", columns=["plot_id"]),
        InRange(kind="in_range", column="yield", min=0, max=80),
        HasType(kind="has_type", column="plot_id", type="number"),
    ]
    results, report = run_checks(frame, "trial", checks)
    summary = [(r.check, r.column, r.passed, r.failed) for r in results]
    assert summary == [
        ("No empty columns", "All columns", 2, 1),
        ("No duplicate rows", "All columns", 2, 2),
        ("Unique key", "plot_id", 2, 2),
        ("Between 0 and 80", "yield", 2, 2),
        ("Type is number", "plot_id", 4, 0),
    ]
    assert "<table" in report


def test_range_on_text_column_fails_non_numbers():
    frame = pd.DataFrame({"yield": ["10", "-", "95"]})
    check = InRange(kind="in_range", column="yield", min=0, max=80)
    results, _ = run_checks(frame, "trial", [check])
    assert (results[-1].passed, results[-1].failed) == (1, 2)
