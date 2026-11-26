import numpy as np
import pandas as pd

from mini_me_sidecar.adapters.data.confounders import check


def confounded(rows: int = 120) -> pd.DataFrame:
    random = np.random.default_rng(2)
    altitude = random.normal(3000, 300, rows)
    rain = 2000 - 0.4 * altitude + random.normal(0, 20, rows)
    return pd.DataFrame(
        {
            "yield": 60 - 0.01 * altitude + random.normal(0, 0.5, rows),
            "rainfall": rain,
            "altitude": altitude,
            "site": np.array(["A", "B", "C"])[np.arange(rows) % 3],
        }
    )


def test_a_control_that_explains_the_focus_shrinks_its_estimate():
    found = check(confounded(), "yield", "rainfall", ["altitude"], "site")
    alone, adjusted = found.alone, found.adjusted
    assert alone > 0.01 and abs(adjusted) < abs(alone) / 4
    names = list(found.estimates["Estimate"])
    assert names == ["Alone", "With altitude", "site = A", "site = B", "site = C"]
    assert set(found.estimates["Rows"][2:]) == {40}


def test_small_subgroups_are_left_out_and_no_controls_gives_one_estimate():
    frame = confounded()
    frame.loc[frame.index[:35], "site"] = "D"
    found = check(frame.head(60), "yield", "rainfall", [], "site")
    assert found.adjusted is None
    assert "site = D" in list(found.estimates["Estimate"])
    assert not any(name.startswith("site = A") for name in found.estimates["Estimate"])

