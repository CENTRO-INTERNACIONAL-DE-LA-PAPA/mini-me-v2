import pandas as pd

from mini_me_sidecar.adapters.data.variables import chart_columns, summaries


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


def test_charts_stop_at_eight_and_skip_columns_that_cannot_be_charted():
    frame = pd.DataFrame({f"n{i}": [1.0, 2.0] for i in range(9)})
    frame["plot_id"] = ["a", "b"]
    frame["empty"] = [None, None]
    wide = pd.concat([frame] * 20, ignore_index=True)
    wide["plot_id"] = [f"p{i}" for i in range(40)]
    charted, skipped = chart_columns(wide, list(wide.columns))
    assert charted == [(f"n{i}", "histogram") for i in range(8)]
    reasons = dict(skipped)
    assert reasons["n8"] == "only 8 columns are charted"
    assert "40 distinct values" in reasons["plot_id"]
    assert reasons["empty"] == "it has no values"
