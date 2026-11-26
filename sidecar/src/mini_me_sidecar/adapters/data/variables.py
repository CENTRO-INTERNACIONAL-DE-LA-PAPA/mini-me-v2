"""Describe Variables: statistics of each column by its type, and which columns to chart."""

import pandas as pd

from mini_me_sidecar.adapters.data.tables import column_type, plain_value

MAX_CHARTS = 8

MAX_CHARTED_DISTINCT = 30

KINDS = ("number", "text", "boolean", "date")


def summaries(frame: pd.DataFrame, columns: list[str]) -> dict[str, pd.DataFrame]:
    """One frame per column type present, in `KINDS` order, with one row per column."""
    rows: dict[str, list[dict[str, object]]] = {kind: [] for kind in KINDS}
    for name in columns:
        series = frame[name]
        kind = column_type(series)
        values = series.dropna()
        row: dict[str, object] = {
            "Column": name,
            "Count": len(values),
            "Missing": int(series.isna().sum()),
        }
        if kind == "number":
            row |= _number(values)
        elif kind == "date":
            row |= _date(values)
        else:
            row |= _category(values)
        rows[kind].append(row)
    return {kind: pd.DataFrame(found) for kind, found in rows.items() if found}


def chart_columns(
    frame: pd.DataFrame, columns: list[str]
) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """The columns to chart with their template, and the others with the reason."""
    charted: list[tuple[str, str]] = []
    skipped: list[tuple[str, str]] = []
    for name in columns:
        series = frame[name]
        kind = column_type(series)
        distinct = series.nunique()
        if distinct == 0:
            skipped.append((name, "it has no values"))
        elif kind == "date":
            skipped.append((name, "date columns are not charted"))
        elif kind in ("text", "boolean") and distinct > MAX_CHARTED_DISTINCT:
            skipped.append((name, f"it has {distinct:,} distinct values, too many to chart"))
        elif len(charted) == MAX_CHARTS:
            skipped.append((name, f"only {MAX_CHARTS} columns are charted"))
        else:
            charted.append((name, "histogram" if kind == "number" else "count_bars"))
    return charted, skipped


def _number(values: pd.Series) -> dict[str, object]:
    if values.empty:
        return {}
    quartiles = values.quantile([0.25, 0.5, 0.75])
    return {
        "Mean": plain_value(values.mean()),
        "Std. dev.": plain_value(values.std()) if len(values) > 1 else None,
        "Min": plain_value(values.min()),
        "Q1": plain_value(quartiles[0.25]),
        "Median": plain_value(quartiles[0.5]),
        "Q3": plain_value(quartiles[0.75]),
        "Max": plain_value(values.max()),
        "Skewness": plain_value(values.skew()) if len(values) > 2 else None,
    }


def _category(values: pd.Series) -> dict[str, object]:
    if values.empty:
        return {"Distinct": 0}
    counts = values.astype(str).value_counts()
    return {
        "Distinct": len(counts),
        "Most frequent": counts.index[0],
        "Share %": round(100 * counts.iloc[0] / len(values), 1),
    }


def _date(values: pd.Series) -> dict[str, object]:
    if values.empty:
        return {}
    first, last = values.min(), values.max()
    return {
        "First": plain_value(first),
        "Last": plain_value(last),
        "Span (days)": (last - first).days,
    }
