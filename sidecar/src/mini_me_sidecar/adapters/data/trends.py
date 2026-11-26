"""Analyze Trends: the linear trend of a number column over time, with statsmodels, and the
change around a date."""

from dataclasses import dataclass

import numpy as np
import pandas as pd
import statsmodels.api as sm

from mini_me_sidecar.adapters.data.groups import difference
from mini_me_sidecar.adapters.data.tables import as_text, column_type
from mini_me_sidecar.context import TraitError

MAX_GROUPS = 10

MIN_GROUP_ROWS = 10

TREND_COLUMNS = ["Trend", "Slope", "Low", "High", "p-value", "Rows"]

CHANGE_COLUMNS = ["Period", "Count", "Mean", "Difference", "Low", "High", "p-value"]


@dataclass
class Trends:
    trends: pd.DataFrame
    unit: str
    change: pd.DataFrame | None


def analyze(
    frame: pd.DataFrame, value: str, time: str, group: str | None, change: str | None
) -> Trends:
    rows = frame.dropna(subset=[value, time, *([group] if group else [])])
    dated = column_type(frame[time]) == "date"
    when = _years(rows[time]) if dated else rows[time].astype(float)
    found = [_trend("Overall", when, rows[value])]
    if group:
        found += _per_group(rows, value, when, group)
    unit = "per year" if dated else f"per unit of {time}"
    cut = _cut(change, dated) if change else None
    return Trends(
        pd.DataFrame(found, columns=TREND_COLUMNS),
        unit,
        _around(rows[value], when, cut, change) if cut is not None else None,
    )


def _years(dates: pd.Series) -> pd.Series:
    return pd.to_datetime(dates).map(pd.Timestamp.toordinal) / 365.25


def _trend(name: str, when: pd.Series, values: pd.Series) -> dict[str, object]:
    if len(values) < 3 or when.nunique() < 2:
        raise TraitError("too_few_rows", f"{name}: a trend needs three rows at two times or more.")
    fitted = sm.OLS(values.to_numpy(dtype=float), sm.add_constant(when.to_numpy())).fit()
    low, high = fitted.conf_int()[1]
    return {
        "Trend": name,
        "Slope": float(fitted.params[1]),
        "Low": float(low),
        "High": float(high),
        "p-value": float(fitted.pvalues[1]),
        "Rows": len(values),
    }


def _per_group(
    rows: pd.DataFrame, value: str, when: pd.Series, group: str
) -> list[dict[str, object]]:
    labels = as_text(rows[group])
    counts = labels.value_counts()
    counts = counts[counts >= MIN_GROUP_ROWS]
    if len(counts) > MAX_GROUPS:
        raise TraitError(
            "too_many_groups",
            f"`{group}` has {len(counts)} groups with {MIN_GROUP_ROWS} rows or more, and I follow "
            f"at most {MAX_GROUPS}.",
        )
    return [
        _trend(f"{group} = {label}", when[labels == label], rows[value][labels == label])
        for label in sorted(counts.index)
    ]


def _cut(change: str, dated: bool) -> float:
    try:
        return float(_years(pd.Series([change])).iloc[0]) if dated else float(change)
    except (ValueError, TypeError):
        raise TraitError(
            "bad_change", f"I couldn't read `{change}` as a time to split at."
        ) from None


def _around(values: pd.Series, when: pd.Series, cut: float, change: str) -> pd.DataFrame:
    before = values[when < cut].to_numpy(dtype=float)
    after = values[when >= cut].to_numpy(dtype=float)
    if len(before) < 2 or len(after) < 2:
        raise TraitError(
            "too_few_rows", f"Comparing around {change} needs two rows or more on each side."
        )
    return pd.DataFrame(
        [
            {"Period": f"Before {change}", "Count": len(before), "Mean": float(before.mean())},
            {
                "Period": f"From {change}",
                "Count": len(after),
                "Mean": float(after.mean()),
                **difference(after, before),
            },
        ],
        columns=CHANGE_COLUMNS,
    )
