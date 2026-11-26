import numpy as np
import pandas as pd
import pytest

from mini_me_sidecar.adapters.data.groups import compare
from mini_me_sidecar.context import TraitError


def sites() -> pd.DataFrame:
    random = np.random.default_rng(1)
    return pd.DataFrame(
        {
            "site": ["Huancayo"] * 30 + ["Cusco"] * 20 + ["La Molina"] * 20 + ["Puno"],
            "yield": np.r_[
                random.normal(20, 1, 30), random.normal(20, 1, 20), random.normal(30, 1, 20), [9]
            ],
        }
    )


def test_differences_from_the_reference_have_intervals_that_tell_groups_apart():
    found = compare(sites(), "yield", "site", None)
    assert found.reference == "Huancayo" and found.left_out == ["Puno"]
    table = found.table.set_index("Group")
    assert list(found.table["Group"]) == ["Huancayo", "La Molina", "Cusco"]
    molina, cusco = table.loc["La Molina"], table.loc["Cusco"]
    assert molina["Low"] > 5 and molina["p-value"] < 0.001
    assert cusco["Low"] < 0 < cusco["High"]
    assert compare(sites(), "yield", "site", "Cusco").reference == "Cusco"


def test_too_many_or_too_few_groups_are_refused():
    many = pd.DataFrame({"plot": [f"p{i}" for i in range(42)], "yield": range(42)})
    with pytest.raises(TraitError, match="at most 20"):
        compare(pd.concat([many, many]), "yield", "plot", None)
    with pytest.raises(TraitError, match="at least two groups"):
        compare(sites().tail(21), "yield", "site", None)
