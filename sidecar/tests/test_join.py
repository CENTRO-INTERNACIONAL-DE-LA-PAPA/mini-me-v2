import pandas as pd

from mini_me_sidecar.adapters.data.catalogue import JoinPlan
from mini_me_sidecar.adapters.data.join import join


def test_left_join_counts_unmatched_keys_across_types():
    harvest = pd.DataFrame({"plot_id": [1, 2, 4], "kg": [5, 6, 7]})
    plots = pd.DataFrame({"plot_id": ["1", "2", "3"], "site": ["A", "A", "B"]})
    plan = JoinPlan(left_on=["plot_id"], right_on=["plot_id"], how="left")
    result, stats = join(harvest, plots, plan, "plots")
    assert (stats.left_rows, stats.right_rows, stats.rows) == (3, 3, 3)
    assert (stats.left_unmatched, stats.right_unmatched) == (1, 1)
    assert list(result["site"].fillna("")) == ["A", "A", ""]

