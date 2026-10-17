"""Clean Data: applies the chosen actions to a table with pandas, holding back any action that
would remove most of the remaining rows."""

import re
from dataclasses import dataclass

import pandas as pd

from mini_me_sidecar.adapters.data.catalogue import (
    Action,
    Cast,
    ChangeCase,
    Clip,
    DropDuplicates,
    DropRowsWhere,
    FillMissing,
    MapValues,
    NormalizeMissing,
    RenameColumns,
    ReplaceRegex,
    Sort,
    StripWhitespace,
    describe_entry,
    problem,
)
from mini_me_sidecar.adapters.data.tables import as_text

# An action that would remove more than this share of the rows is not applied.
MAX_DROPPED_SHARE = 0.5

TRUE = {"true", "yes", "1", "si", "sí", "y"}
FALSE = {"false", "no", "0", "n"}


@dataclass
class Applied:
    action: str
    column: str
    changed: int | None
    note: str = ""


def apply_actions(
    frame: pd.DataFrame, actions: list[Action]
) -> tuple[pd.DataFrame, list[Applied]]:
    """The cleaned table and one entry per action: applied, held back or ignored."""
    frame = frame.copy()
    log: list[Applied] = []
    for action in actions:
        label = describe_entry(action)
        if reason := problem(action, [str(c) for c in frame.columns]):
            log.append(Applied(label, "", None, f"Ignored: {reason}"))
            continue
        rows_before = len(frame)
        cleaned, column, changed = _apply(frame, action)
        dropped = rows_before - len(cleaned)
        if rows_before and dropped / rows_before > MAX_DROPPED_SHARE:
            share = round(100 * dropped / rows_before)
            note = f"Held back: it would drop {share}% of the rows"
            log.append(Applied(label, column, None, note))
            continue
        frame = cleaned
        log.append(Applied(label, column, changed))
    return frame.reset_index(drop=True), log


def log_frame(log: list[Applied]) -> pd.DataFrame:
    return pd.DataFrame(
        [[a.action, a.column, a.changed, a.note] for a in log],
        columns=["Action", "Column", "Changed", "Note"],
    )


def _apply(frame: pd.DataFrame, action: Action) -> tuple[pd.DataFrame, str, int]:
    """The table after `action`, the columns it touched, and how many cells or rows changed."""
    match action:
        case StripWhitespace(columns=columns):
            names = columns or [c for c in frame.columns if _is_text(frame[c])]
            changed = 0
            for name in names:
                before = frame[name]
                after = before.map(lambda v: v.strip() if isinstance(v, str) else v)
                changed += _count_changed(before, after)
                frame[name] = after
            return frame, _names(columns, "all text columns"), changed
        case NormalizeMissing(values=values, columns=columns):
            names = columns or list(frame.columns)
            changed = 0
            for name in names:
                mask = as_text(frame[name]).isin(values)
                changed += int(mask.sum())
                frame[name] = _retyped(frame[name].mask(mask))
            return frame, _names(columns, "all columns"), changed
        case ChangeCase(column=column, case=case):
            before = frame[column]
            after = before.map(lambda v: getattr(v, case)() if isinstance(v, str) else v)
            frame[column] = after
            return frame, column, _count_changed(before, after)
        case Cast(column=column, type=kind):
            before = frame[column]
            frame[column] = _cast(before, kind)
            return frame, column, int(before.notna().sum())
        case MapValues(column=column, mapping=mapping):
            before = frame[column]
            table = {m.old: m.new for m in mapping}
            text = as_text(before)
            mask = text.isin(table)
            frame[column] = _retyped(before.where(~mask, text.map(table)))
            return frame, column, int(mask.sum())
        case ReplaceRegex(column=column, pattern=pattern, replacement=replacement):
            before = frame[column]
            compiled = re.compile(pattern)
            after = before.map(lambda v: compiled.sub(replacement, v) if isinstance(v, str) else v)
            frame[column] = after
            return frame, column, _count_changed(before, after)
        case DropDuplicates(columns=columns):
            kept = frame.drop_duplicates(subset=columns or None)
            return kept, _names(columns, "all columns"), len(frame) - len(kept)
        case DropRowsWhere(column=column, operator=operator, value=value):
            mask = _matches(frame[column], operator, value)
            return frame[~mask], column, int(mask.sum())
        case Clip(column=column, min=low, max=high):
            before = frame[column]
            after = pd.to_numeric(before, errors="coerce").clip(lower=low, upper=high)
            frame[column] = after
            return frame, column, _count_changed(before, after)
        case FillMissing(column=column, value=value):
            before = frame[column]
            fill = value
            if pd.api.types.is_numeric_dtype(before) and isinstance(value, str):
                number = pd.to_numeric(pd.Series([value]), errors="coerce")[0]
                fill = value if pd.isna(number) else number
            frame[column] = before.fillna(fill)
            return frame, column, int(before.isna().sum())
        case RenameColumns(renames=renames):
            mapping = {r.old: r.new for r in renames}
            return frame.rename(columns=mapping), ", ".join(mapping), len(mapping)
        case Sort(columns=columns, descending=descending):
            ordered = frame.sort_values(columns, ascending=not descending, na_position="last")
            moved = int((ordered.index.to_numpy() != frame.index.to_numpy()).sum())
            return ordered, ", ".join(columns), moved
    raise ValueError(f"unknown action {action!r}")


def _cast(series: pd.Series, kind: str) -> pd.Series:
    match kind:
        case "number":
            return pd.to_numeric(series, errors="coerce")
        case "date":
            return pd.to_datetime(series, errors="coerce", format="mixed")
        case "boolean":
            text = series.astype(str).str.strip().str.lower()
            return text.map(lambda v: True if v in TRUE else False if v in FALSE else None)
    return as_text(series)


def _matches(series: pd.Series, operator: str, value: object) -> pd.Series:
    if operator == "is_missing":
        return series.isna()
    if pd.api.types.is_numeric_dtype(series):
        number = pd.to_numeric(pd.Series([value]), errors="coerce")[0]
        left, right = series, number
    else:
        left, right = as_text(series), str(value)
    match operator:
        case "==":
            result = left == right
        case "!=":
            result = left != right
        case "<":
            result = left < right
        case "<=":
            result = left <= right
        case ">":
            result = left > right
        case _:
            result = left >= right
    return result.fillna(False).astype(bool)


def _retyped(series: pd.Series) -> pd.Series:
    """A text column becomes a number column once every value left is a number."""
    if pd.api.types.is_numeric_dtype(series) or series.dropna().empty:
        return series
    numbers = pd.to_numeric(series, errors="coerce")
    return numbers if numbers.notna().sum() == series.notna().sum() else series


def _count_changed(before: pd.Series, after: pd.Series) -> int:
    both_missing = before.isna() & after.isna()
    return int(((before != after) & ~both_missing).sum())


def _is_text(series: pd.Series) -> bool:
    return not (
        pd.api.types.is_numeric_dtype(series)
        or pd.api.types.is_bool_dtype(series)
        or pd.api.types.is_datetime64_any_dtype(series)
    )


def _names(columns: list[str] | None, everything: str) -> str:
    return ", ".join(columns) if columns else everything
