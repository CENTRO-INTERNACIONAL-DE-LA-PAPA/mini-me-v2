import math

import pandas as pd

from mini_me_sidecar.adapters.data.preview import table_data


def test_values_are_json_safe():
    frame = pd.DataFrame({"y": [1.5, math.nan], "d": pd.to_datetime(["2024-05-01", None])})
    data = table_data(frame)
    assert data["columns"] == [{"name": "y", "type": "number"}, {"name": "d", "type": "date"}]
    assert data["rows"] == [[1.5, "2024-05-01"], [None, None]]
    assert "total_rows" not in data

