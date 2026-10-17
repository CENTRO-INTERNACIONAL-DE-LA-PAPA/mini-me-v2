import math

import pandas as pd

from mini_me_sidecar.adapters.data.preview import MAX_ROWS, table_data


def test_preview_caps_rows_and_names_source():
    data = table_data(pd.DataFrame({"x": range(MAX_ROWS + 10)}), source="big.csv")
    assert len(data["rows"]) == MAX_ROWS
    assert (data["total_rows"], data["source"]) == (MAX_ROWS + 10, "big.csv")


def test_values_are_json_safe():
    frame = pd.DataFrame({"y": [1.5, math.nan], "d": pd.to_datetime(["2024-05-01", None])})
    data = table_data(frame)
    assert data["columns"] == [{"name": "y", "type": "number"}, {"name": "d", "type": "date"}]
    assert data["rows"] == [[1.5, "2024-05-01"], [None, None]]
    assert "total_rows" not in data
