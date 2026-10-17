"""Profile Data: what a table holds, computed with pandas alone."""

import pandas as pd

from mini_me_sidecar.adapters.data.tables import column_type, plain_value

COLUMNS = ["Column", "Type", "Missing", "Missing %", "Distinct", "Min", "Max"]


def profile(frame: pd.DataFrame) -> pd.DataFrame:
    """One row per column: type, missing values, distinct values and, for numbers and dates,
    the range."""
    rows = []
    for name in frame.columns:
        series = frame[name]
        non_null = series.dropna()
        kind = column_type(series)
        missing = int(series.isna().sum())
        ranged = kind in ("number", "date") and len(non_null) > 0
        rows.append(
            {
                "Column": str(name),
                "Type": kind,
                "Missing": missing,
                "Missing %": round(100 * missing / len(series), 1) if len(series) else 0.0,
                "Distinct": int(non_null.nunique()),
                "Min": plain_value(non_null.min()) if ranged else None,
                "Max": plain_value(non_null.max()) if ranged else None,
            }
        )
    return pd.DataFrame(rows, columns=list(rows[0]) if rows else COLUMNS)


def summary(name: str, frame: pd.DataFrame) -> str:
    duplicates = int(frame.duplicated().sum())
    rows, columns = frame.shape
    text = f"`{name}` has {rows:,} rows and {columns:,} columns"
    if duplicates:
        text += f", with {duplicates:,} duplicate row{'s' if duplicates != 1 else ''}."
    else:
        text += ", with no duplicate rows."
    empty = [str(c) for c in frame.columns if frame[c].isna().all()]
    if empty:
        text += " Empty columns: " + ", ".join(f"`{c}`" for c in empty) + "."
    return text
