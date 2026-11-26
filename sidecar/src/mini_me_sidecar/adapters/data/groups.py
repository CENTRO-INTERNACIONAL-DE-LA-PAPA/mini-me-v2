"""Compare Groups: how a number column differs between groups, as differences of means from a
reference group with bootstrap intervals and Welch p-values, computed with scipy."""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy import stats

from mini_me_sidecar.adapters.data.tables import as_text
from mini_me_sidecar.context import TraitError

MAX_GROUPS = 20

RESAMPLES = 2_000

COLUMNS = ["Group", "Count", "Mean", "Difference", "Low", "High", "p-value"]


@dataclass
class Comparison:
    table: pd.DataFrame
    reference: str
    left_out: list[str] = field(default_factory=list)


def compare(frame: pd.DataFrame, value: str, groups: str, reference: str | None) -> Comparison:
    rows = frame[[value, groups]].dropna()
    labels = as_text(rows[groups])
    counts = labels.value_counts()
    if len(counts) > MAX_GROUPS:
        raise TraitError(
            "too_many_groups",
            f"`{groups}` has {len(counts):,} groups, and I compare at most {MAX_GROUPS}.",
        )
    left_out = sorted(counts.index[counts < 2])
    kept = counts[counts >= 2]
    if len(kept) < 2:
        raise TraitError(
            "too_few_groups", f"`{groups}` needs at least two groups with two values or more."
        )
    reference = reference if reference in kept.index else str(kept.idxmax())
    values = {g: rows[value][labels == g].to_numpy(dtype=float) for g in kept.index}
    base = values[reference]
    found = [_row(reference, base, None)]
    found += sorted(
        (_row(g, values[g], base) for g in kept.index if g != reference),
        key=lambda r: -abs(r["Difference"]),
    )
    return Comparison(pd.DataFrame(found, columns=COLUMNS), reference, left_out)


def _row(group: str, values: np.ndarray, base: np.ndarray | None) -> dict[str, object]:
    row: dict[str, object] = {"Group": group, "Count": len(values), "Mean": float(values.mean())}
    return row if base is None else row | difference(values, base)


def difference(values: np.ndarray, base: np.ndarray) -> dict[str, float]:
    interval = stats.bootstrap(
        (values, base),
        lambda a, b, axis: a.mean(axis=axis) - b.mean(axis=axis),
        n_resamples=RESAMPLES,
        method="percentile",
        vectorized=True,
        rng=np.random.default_rng(0),
    ).confidence_interval
    return {
        "Difference": float(values.mean() - base.mean()),
        "Low": float(interval.low),
        "High": float(interval.high),
        "p-value": float(stats.ttest_ind(values, base, equal_var=False).pvalue),
    }
