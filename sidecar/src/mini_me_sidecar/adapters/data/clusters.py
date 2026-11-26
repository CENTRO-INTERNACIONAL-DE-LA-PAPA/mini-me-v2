"""Find Clusters: groups of similar rows by their number columns, and the two principal
components that show them, with scikit-learn."""

from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import pandas as pd
from sklearn.cluster import HDBSCAN, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from mini_me_sidecar.context import TraitError

Method = Literal["kmeans", "hdbscan"]

# HDBSCAN's time and memory grow too fast beyond this.
MAX_HDBSCAN_ROWS = 20_000

# Silhouette scores compare every pair of rows, so they are taken on a sample of this many.
SILHOUETTE_ROWS = 5_000

TRIED = range(2, 9)


@dataclass
class Clusters:
    # The table with `cluster`, `pc1` and `pc2` added, empty for rows not clustered.
    table: pd.DataFrame
    summary: pd.DataFrame
    method: str
    clusters: int
    clustered: int
    # The share of the variation, in percent, that `pc1` and `pc2` explain.
    explained: tuple[float, float]
    notes: list[str] = field(default_factory=list)


def cluster(
    frame: pd.DataFrame, columns: list[str], method: Method, clusters: int | None
) -> Clusters:
    complete = frame[columns].dropna().astype(float)
    if len(complete) < max(clusters or 0, 3) + 1:
        raise TraitError(
            "too_few_rows", f"Only {len(complete)} rows have every column, too few to cluster."
        )
    scaled = StandardScaler().fit_transform(complete)
    notes: list[str] = []
    if method == "hdbscan" and len(complete) > MAX_HDBSCAN_ROWS:
        notes.append(
            f"HDBSCAN is used on up to {MAX_HDBSCAN_ROWS:,} rows and {len(complete):,} have "
            "every column, so I used k-means."
        )
        method = "kmeans"
    if method == "hdbscan":
        labels = HDBSCAN(copy=True).fit_predict(scaled)
        noise = int((labels == -1).sum())
        if noise:
            notes.append(f"HDBSCAN left {noise:,} rows in no cluster.")
    else:
        k = clusters or _best_k(scaled, notes)
        labels = KMeans(n_clusters=k, random_state=0, n_init=10).fit_predict(scaled)
    components = PCA(n_components=2, random_state=0).fit(scaled)
    points = components.transform(scaled)
    table = frame.copy()
    table["cluster"] = pd.Series(
        [label + 1 if label >= 0 else pd.NA for label in labels], index=complete.index
    ).astype("Int64")
    table["pc1"] = pd.Series(points[:, 0], index=complete.index)
    table["pc2"] = pd.Series(points[:, 1], index=complete.index)
    explained = tuple(round(100 * float(r), 1) for r in components.explained_variance_ratio_)
    return Clusters(
        table=table,
        summary=_summary(table, columns),
        method="HDBSCAN" if method == "hdbscan" else "k-means",
        clusters=int(table["cluster"].nunique()),
        clustered=int(table["cluster"].notna().sum()),
        explained=(explained[0], explained[1]),
        notes=notes,
    )


def _best_k(scaled: np.ndarray, notes: list[str]) -> int:
    scores = {}
    for k in TRIED:
        if k >= len(scaled):
            break
        labels = KMeans(n_clusters=k, random_state=0, n_init=10).fit_predict(scaled)
        if len(set(labels)) < 2:
            continue
        sample = min(SILHOUETTE_ROWS, len(scaled))
        scores[k] = silhouette_score(scaled, labels, sample_size=sample, random_state=0)
    if not scores:
        return 2
    best = max(scores, key=lambda k: scores[k])
    notes.append(
        f"I tried {min(scores)} to {max(scores)} clusters and kept {best}, which separates the "
        f"rows best (silhouette score {scores[best]:.2f}, from -1 to 1)."
    )
    return best


def _summary(table: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """One row per cluster: its size and each column's mean."""
    grouped = table.dropna(subset=["cluster"]).groupby("cluster")
    summary = grouped[columns].mean().round(4)
    summary.insert(0, "Rows", grouped.size())
    return summary.reset_index().rename(columns={"cluster": "Cluster"})
