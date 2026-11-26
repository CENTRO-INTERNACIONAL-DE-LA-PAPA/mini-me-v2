import numpy as np
import pandas as pd
import pytest

from mini_me_sidecar.adapters.data.trends import analyze
from mini_me_sidecar.context import TraitError


def seasons() -> pd.DataFrame:
    random = np.random.default_rng(3)
    dates = pd.date_range("2020-01-01", "2024-12-31", periods=200)
    years = (dates - dates[0]).days / 365.25
    step = np.where(dates >= pd.Timestamp("2023-01-01"), 5.0, 0.0)
    return pd.DataFrame(
        {
            "planted": dates,
            "yield": 20 + years + step + random.normal(0, 0.3, 200),
            "site": np.array(["A", "B"])[np.arange(200) % 2],
        }
    )


def test_a_yearly_rise_and_a_step_at_a_date_are_found():
    found = analyze(seasons(), "yield", "planted", "site", "2023-01-01")
    assert found.unit == "per year"
    overall = found.trends.iloc[0]
    assert overall["Trend"] == "Overall" and overall["Slope"] > 1
    assert list(found.trends["Trend"][1:]) == ["site = A", "site = B"]
    after = found.change.iloc[1]
    assert after["Low"] > 4 and after["Count"] + found.change.iloc[0]["Count"] == 200


def test_number_times_keep_their_unit_and_unreadable_dates_are_refused():
    frame = pd.DataFrame({"week": range(30), "height": [2.0 * w for w in range(30)]})
    found = analyze(frame, "height", "week", None, None)
    assert found.unit == "per unit of week" and found.change is None
    assert found.trends.iloc[0]["Slope"] == pytest.approx(2.0)
    with pytest.raises(TraitError, match="couldn't read"):
        analyze(seasons(), "yield", "planted", None, "spring")
