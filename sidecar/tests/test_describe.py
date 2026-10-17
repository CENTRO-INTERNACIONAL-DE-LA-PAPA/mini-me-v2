import json

import pandas as pd

from mini_me_sidecar.adapters.data.describe import describe, shared_line
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
    description, listed = describe(table())
    assert listed == ["variety"]
    columns = {c["name"]: c for c in description["columns"]}
    assert "top_values" not in columns["farmer_name"]
    assert "top_values" not in columns["plot_id"]
    assert columns["yield"]["min"] == 0.0 and columns["yield"]["max"] == 39.0
    assert "Ana" not in json.dumps(description)


def test_names_and_types_only():
    description, listed = describe(table(), values=False)
    assert listed == []
    assert description["columns"][0] == {"name": "plot_id", "type": "number"}


def test_shared_line():
    assert shared_line(["variety"]) == (
        "_Shared with the AI model: column names, types and statistics; values of `variety`._"
    )
