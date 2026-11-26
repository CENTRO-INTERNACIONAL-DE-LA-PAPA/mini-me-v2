import numpy as np
import pandas as pd
import pytest

from mini_me_sidecar.adapters.data.drivers import regress
from mini_me_sidecar.context import TraitError


def trial(rows: int = 60) -> pd.DataFrame:
    random = np.random.default_rng(0)
    rain = random.normal(600, 50, rows)
    altitude = random.normal(3000, 200, rows)
    variety = np.array(["Yungay", "Canchán", "Única"])[np.arange(rows) % 3]
    frame = pd.DataFrame(
        {
            "yield": 0.02 * rain
            + np.where(variety == "Única", 3, 0)
            + random.normal(0, 0.5, rows),
            "rainfall": rain,
            "variety": variety,
            "altitude": altitude,
            "temp": 20 - altitude / 300 + random.normal(0, 0.05, rows),
        }
    )
    frame.loc[3, "rainfall"] = None
    return frame


def test_terms_follow_the_drivers_with_one_per_other_category_and_collinear_vifs():
    found = regress(trial(), "yield", ["rainfall", "variety", "altitude", "temp"])
    terms = found.terms.set_index("Term")
    assert list(terms.index) == [
        "rainfall", "variety = Yungay", "variety = Única", "altitude", "temp"
    ]
    assert terms.loc["rainfall", "Low"] < 0.02 < terms.loc["rainfall", "High"]
    assert terms.loc["variety = Única", "Low"] > 2
    assert terms.loc["altitude", "VIF"] > 5 and terms.loc["temp", "VIF"] > 5
    assert terms.loc["rainfall", "VIF"] < 5
    assert (found.rows, found.left_out) == (59, 1)


def test_more_terms_than_rows_is_refused():
    with pytest.raises(TraitError, match="too few"):
        regress(trial().head(4), "yield", ["rainfall", "variety", "altitude"])
