"""Join Data: joins two tables on key columns and counts the keys without a match."""

from dataclasses import dataclass

import pandas as pd

from mini_me_sidecar.adapters.data.catalogue import JoinPlan
from mini_me_sidecar.adapters.data.tables import as_text
from mini_me_sidecar.context import TraitError


@dataclass
class JoinStats:
    left_rows: int
    right_rows: int
    rows: int
    # Distinct keys of each table that the other table lacks.
    left_unmatched: int
    right_unmatched: int


def shared_key(left: pd.DataFrame, right: pd.DataFrame) -> JoinPlan | None:
    """A left join on the one column both tables have, or None when they share none or
    several."""
    shared = [c for c in left.columns if c in right.columns]
    if len(shared) != 1:
        return None
    return JoinPlan(left_on=[str(shared[0])], right_on=[str(shared[0])], how="left")


def join(
    left: pd.DataFrame, right: pd.DataFrame, plan: JoinPlan, right_name: str
) -> tuple[pd.DataFrame, JoinStats]:
    if len(plan.left_on) != len(plan.right_on) or not plan.left_on:
        raise TraitError("join_keys", "The two tables need the same number of key columns.")
    missing = [c for c in plan.left_on if c not in left.columns]
    missing += [c for c in plan.right_on if c not in right.columns]
    if missing:
        names = ", ".join(f"`{c}`" for c in missing)
        raise TraitError("join_keys", f"The tables have no key column {names}.")
    left, right = left.copy(), right.copy()
    # Keys read as numbers from one file and as text from another would never match.
    for a, b in zip(plan.left_on, plan.right_on):
        if left[a].dtype != right[b].dtype:
            left[a], right[b] = as_text(left[a]), as_text(right[b])
    left_keys = set(map(tuple, left[plan.left_on].dropna().itertuples(False)))
    right_keys = set(map(tuple, right[plan.right_on].dropna().itertuples(False)))
    result = left.merge(
        right,
        how=plan.how,
        left_on=plan.left_on,
        right_on=plan.right_on,
        suffixes=("", f"_{right_name}"),
    )
    stats = JoinStats(
        left_rows=len(left),
        right_rows=len(right),
        rows=len(result),
        left_unmatched=len(left_keys - right_keys),
        right_unmatched=len(right_keys - left_keys),
    )
    return result, stats
