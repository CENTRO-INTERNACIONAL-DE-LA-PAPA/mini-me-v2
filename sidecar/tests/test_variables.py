import pandas as pd

from mini_me_sidecar.adapters.data.variables import summaries


def test_each_column_type_gets_its_own_statistics():
    frame = pd.DataFrame(
        {
            "yield": [10.0, 20.0, 30.0, None],
            "variety": ["Yungay", "Yungay", "Canchán", None],
            "irrigated": [True, False, True, True],
            "planted": pd.to_datetime(["2024-01-01", "2024-01-11", None, "2024-01-06"]),
        }
    )
    found = summaries(frame, list(frame.columns))
    assert list(found) == ["number", "text", "boolean", "date"]
    number = found["number"].iloc[0]
    assert (number["Count"], number["Missing"], number["Mean"]) == (3, 1, 20.0)
    assert (number["Min"], number["Median"], number["Max"]) == (10.0, 20.0, 30.0)
    text = found["text"].iloc[0]
    assert (text["Distinct"], text["Most frequent"], text["Share %"]) == (2, "Yungay", 66.7)
    assert found["boolean"].iloc[0]["Most frequent"] == "True"
    date = found["date"].iloc[0]
    assert (date["First"], date["Last"], date["Span (days)"]) == ("2024-01-01", "2024-01-11", 10)

