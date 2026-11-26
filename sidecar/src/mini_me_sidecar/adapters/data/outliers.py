"""Detect Outliers: values beyond a column's quartiles by a multiple of its interquartile range,
and rows that an Isolation Forest finds unusual across columns."""

from collections import defaultdict
from dataclasses import dataclass, field

import pandas as pd
from sklearn.ensemble import IsolationForest

from mini_me_sidecar.adapters.data.tables import plain_value

# An Isolation Forest on fewer complete rows says little.
MIN_FOREST_ROWS = 10


@dataclass
class Outliers:
    bounds: pd.DataFrame
    # The flagged rows of the table, after a `Row` number (1 for the first data row) and a
    # `Reason` column.
    flagged: pd.DataFrame
    unusual_rows: int = 0
    notes: list[str] = field(default_factory=list)


def detect(frame: pd.DataFrame, columns: list[str], multiple: float) -> Outliers:
    rows = frame.reset_index(drop=True)
    reasons: dict[int, list[str]] = defaultdict(list)
    bounds = [_bounds(rows[name], name, multiple, reasons) for name in columns]
    result = Outliers(pd.DataFrame(bounds), pd.DataFrame())
    if len(columns) > 1:
        _forest(rows, columns, reasons, result)
    flagged = rows.loc[sorted(reasons)].copy()
    flagged.insert(0, "Reason", ["; ".join(reasons[i]) for i in flagged.index])
    flagged.insert(0, "Row", [i + 1 for i in flagged.index])
    result.flagged = flagged.reset_index(drop=True)
    return result


def _bounds(
    series: pd.Series, name: str, multiple: float, reasons: dict[int, list[str]]
) -> dict[str, object]:
    values = series.dropna()
    if values.empty:
        return {"Column": name, "Below": 0, "Above": 0}
    q1, q3 = values.quantile(0.25), values.quantile(0.75)
    low, high = q1 - multiple * (q3 - q1), q3 + multiple * (q3 - q1)
    for i in values.index[values < low]:
        reasons[i].append(f"{name} below {low:g}")
    for i in values.index[values > high]:
        reasons[i].append(f"{name} above {high:g}")
    return {
        "Column": name,
        "Q1": plain_value(q1),
        "Q3": plain_value(q3),
        "Lower bound": plain_value(low),
        "Upper bound": plain_value(high),
        "Below": int((values < low).sum()),
        "Above": int((values > high).sum()),
    }


def _forest(
    rows: pd.DataFrame, columns: list[str], reasons: dict[int, list[str]], result: Outliers
) -> None:
    complete = rows[columns].dropna().astype(float)
    if len(complete) < MIN_FOREST_ROWS:
        result.notes.append(
            f"Only {len(complete)} rows have every column, too few to find unusual rows across "
            "the columns."
        )
        return
    unusual = IsolationForest(random_state=0).fit_predict(complete) == -1
    for i in complete.index[unusual]:
        reasons[i].append("unusual across the columns")
    result.unusual_rows = int(unusual.sum())
