import numpy as np
import pandas as pd
import pytest

from mini_me_sidecar.adapters.data.clusters import cluster
from mini_me_sidecar.context import TraitError


def two_groups(rows: int = 40) -> pd.DataFrame:
    random = np.random.default_rng(0)
    half = rows // 2
    frame = pd.DataFrame(
        {
            "plot": range(rows),
            "yield": np.r_[random.normal(10, 1, half), random.normal(40, 1, half)],
            "height": np.r_[random.normal(50, 2, half), random.normal(90, 2, half)],
        }
    )
    frame.loc[5, "yield"] = None
    return frame


def test_two_separate_groups_make_two_clusters_and_incomplete_rows_stay_out():
    found = cluster(two_groups(), ["yield", "height"], "kmeans", None)
    assert (found.method, found.clusters, found.clustered) == ("k-means", 2, 39)
    assert "kept 2" in found.notes[0]
    assert pd.isna(found.table.loc[5, "cluster"]) and pd.isna(found.table.loc[5, "pc1"])
    assert found.table.loc[0, "cluster"] != found.table.loc[30, "cluster"]
    assert sorted(found.summary["Rows"]) == [19, 20]
    assert found.explained[0] > 90

    assert cluster(two_groups(), ["yield", "height"], "kmeans", 3).clusters == 3
    with pytest.raises(TraitError):
        cluster(two_groups().head(3), ["yield", "height"], "kmeans", None)

