import json

import pandas as pd

from mini_me_sidecar.adapters.data.describe import describe
from mini_me_sidecar.adapters.data.tables import Table


def table() -> Table:
    frame = pd.DataFrame(
        {
            "plot_id": range(40),
            "farmer_name": ["Ana", "Luis"] * 20,
            "variety": ["Yungay", "yungay", "Canchán", "Perricholi"] * 10,
            "yield": [float(i) for i in range(40)],
        }
    )
    return Table("trial.csv", frame)


def test_lists_only_category_values_and_never_rows():
    description = describe(table())
    columns = {c["name"]: c for c in description["columns"]}
    assert [c for c in columns if "top_values" in columns[c]] == ["variety"]
    assert "top_values" not in columns["farmer_name"]
    assert "top_values" not in columns["plot_id"]
    assert columns["yield"]["min"] == 0.0 and columns["yield"]["max"] == 39.0
    assert "Ana" not in json.dumps(description)


def test_names_and_types_only():
    description = describe(table(), values=False)
    assert description["columns"][0] == {"name": "plot_id", "type": "number"}

