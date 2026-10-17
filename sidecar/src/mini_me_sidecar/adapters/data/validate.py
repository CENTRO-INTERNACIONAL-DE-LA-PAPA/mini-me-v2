"""Validate Data: the default checks and the chosen ones, run with pointblank. Type checks and
the empty-column check are counted with pandas, since pointblank has no per-value type
check."""

from dataclasses import dataclass

import pandas as pd
import pointblank as pb

from mini_me_sidecar.adapters.data.catalogue import (
    Check,
    HasType,
    InRange,
    InSet,
    Matches,
    NotNull,
    Unique,
)

TRUE_FALSE = {"true", "false", "yes", "no", "1", "0", "si", "sí"}

MAX_LISTED = 5


@dataclass
class CheckResult:
    check: str
    column: str
    passed: int
    failed: int
    # Set when the check could not run on this column.
    error: bool = False

    @property
    def result(self) -> str:
        if self.error:
            return "Could not run"
        return "Passed" if self.failed == 0 else "Failed"


def run_checks(
    frame: pd.DataFrame, name: str, checks: list[Check]
) -> tuple[list[CheckResult], str]:
    """Every result, defaults first, and pointblank's report as HTML."""
    # A range check reads its column as numbers; values that aren't numbers fail it.
    ranged = {c.column for c in checks if isinstance(c, InRange)}
    checked = frame.assign(**{c: pd.to_numeric(frame[c], errors="coerce") for c in ranged})
    validation = pb.Validate(data=checked, tbl_name=name)
    # Each slot is a result, or the label and column of the next pointblank step; pointblank
    # numbers its steps from 1 in the order they were added.
    slots: list[CheckResult | tuple[str, str]] = []

    def step(label: str, column: str) -> None:
        slots.append((label, column))

    empty = [str(c) for c in frame.columns if frame[c].isna().all()]
    filled = len(frame.columns) - len(empty)
    slots.append(CheckResult("No empty columns", "All columns", filled, len(empty)))
    validation = validation.rows_distinct()
    step("No duplicate rows", "All columns")

    for check in checks:
        match check:
            case NotNull(columns=columns):
                for column in columns:
                    validation = validation.col_vals_not_null(columns=column)
                    step("Not missing", column)
            case Unique(columns=columns):
                validation = validation.rows_distinct(columns_subset=columns)
                step("Unique key", ", ".join(columns))
            case InRange(column=column, min=low, max=high):
                if low is not None and high is not None:
                    validation = validation.col_vals_between(columns=column, left=low, right=high)
                    step(f"Between {_num(low)} and {_num(high)}", column)
                elif low is not None:
                    validation = validation.col_vals_ge(columns=column, value=low)
                    step(f"At least {_num(low)}", column)
                else:
                    validation = validation.col_vals_le(columns=column, value=high)
                    step(f"At most {_num(high)}", column)
            case InSet(column=column, values=values):
                allowed = _same_type(frame[column], values)
                validation = validation.col_vals_in_set(columns=column, set=allowed)
                step("One of " + _listed(values), column)
            case Matches(column=column, pattern=pattern):
                validation = validation.col_vals_regex(columns=column, pattern=pattern)
                step(f"Matches {pattern}", column)
            case HasType(column=column, type=kind):
                slots.append(_type_check(frame[column], column, kind))

    validation = validation.interrogate()
    steps = iter(validation.validation_info)
    results = []
    for slot in slots:
        if isinstance(slot, CheckResult):
            results.append(slot)
            continue
        label, column = slot
        found = next(steps)
        if found.eval_error:
            results.append(CheckResult(label, column, 0, 0, error=True))
        else:
            results.append(CheckResult(label, column, int(found.n_passed), int(found.n_failed)))
    return results, validation.get_tabular_report().as_raw_html()


def results_frame(results: list[CheckResult]) -> pd.DataFrame:
    return pd.DataFrame(
        [[r.check, r.column, r.passed, r.failed, r.result] for r in results],
        columns=["Check", "Column", "Passed", "Failed", "Result"],
    )


def _type_check(series: pd.Series, column: str, kind: str) -> CheckResult:
    values = series.dropna()
    match kind:
        case "number":
            ok = pd.to_numeric(values, errors="coerce").notna()
        case "date":
            ok = pd.to_datetime(values, errors="coerce", format="mixed").notna()
        case "boolean":
            ok = values.astype(str).str.strip().str.lower().isin(TRUE_FALSE)
        case _:
            ok = pd.Series(True, index=values.index)
    return CheckResult(f"Type is {kind}", column, int(ok.sum()), int((~ok).sum()))


def _same_type(series: pd.Series, values: list[str]) -> list:
    """`values` as numbers when the column holds numbers, so they can match."""
    if not pd.api.types.is_numeric_dtype(series):
        return values
    numbers = pd.to_numeric(pd.Series(values), errors="coerce")
    return [v for v in numbers.dropna().tolist()]


def _listed(values: list[str]) -> str:
    shown = ", ".join(values[:MAX_LISTED])
    return shown + (f" and {len(values) - MAX_LISTED} more" if len(values) > MAX_LISTED else "")


def _num(value: float) -> str:
    return f"{value:g}"
