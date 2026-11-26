import pandas as pd
import pytest

from mini_me_sidecar.adapters.data.correlations import correlations


def test_pairs_are_sorted_by_strength_and_count_the_rows_with_both_values():
    frame = pd.DataFrame(
        {
            "yield": [1.0, 2.0, 3.0, 4.0, 5.0, None],
            "tubers": [2.0, 4.0, 6.0, 8.0, 10.0, 12.0],
            "rain": [5.0, 1.0, 4.0, 2.0, 3.0, 3.0],
            "constant": [1.0] * 6,
        }
    )
    pearson = correlations(frame, ["rain", "yield", "tubers", "constant"], "pearson")
    first = pearson.iloc[0]
    assert {first["Column A"], first["Column B"]} == {"yield", "tubers"}
    assert first["Coefficient"] == pytest.approx(1.0)
    assert first["Rows"] == 5 and first["p-value"] < 0.01
    assert pearson["Coefficient"].isna().sum() == 3

    curved = pd.DataFrame({"x": [1.0, 2.0, 3.0, 4.0, 5.0], "y": [1.0, 2.0, 4.0, 8.0, 100.0]})
    assert correlations(curved, ["x", "y"], "spearman").iloc[0]["Coefficient"] == 1.0
    assert correlations(curved, ["x", "y"], "pearson").iloc[0]["Coefficient"] < 0.9
