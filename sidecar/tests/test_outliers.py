import pandas as pd

from mini_me_sidecar.adapters.data.outliers import detect


def table() -> pd.DataFrame:
    yields = [10.0 + i % 5 for i in range(40)]
    yields[3] = 20.0
    yields[7] = 100.0
    yields[11] = 30.0
    heights = [50.0 + i % 7 for i in range(40)]
    heights[20] = None
    return pd.DataFrame({"plot": range(40), "yield": yields, "height": heights})


def test_bounds_count_the_values_outside_them_and_each_flagged_row_says_why():
    found = detect(table(), ["yield"], 1.5)
    bounds = found.bounds.iloc[0]
    assert (bounds["Q1"], bounds["Q3"], bounds["Upper bound"]) == (11.0, 14.0, 18.5)
    assert (bounds["Below"], bounds["Above"]) == (0, 3)
    assert list(found.flagged["Row"]) == [4, 8, 12]
    assert list(found.flagged["Reason"]) == ["yield above 18.5"] * 3
    assert list(found.flagged.columns[:3]) == ["Row", "Reason", "plot"]

    extreme = detect(table(), ["yield"], 3)
    assert extreme.bounds.iloc[0]["Upper bound"] == 23.0
    assert list(extreme.flagged["Row"]) == [8, 12]


def test_the_forest_runs_on_complete_rows_of_two_or_more_columns():
    found = detect(table(), ["yield", "height"], 1.5)
    assert found.unusual_rows > 0
    assert 21 not in set(found.flagged[found.flagged["Reason"].str.contains("across")]["Row"])
    assert detect(table().head(8), ["yield", "height"], 1.5).notes
