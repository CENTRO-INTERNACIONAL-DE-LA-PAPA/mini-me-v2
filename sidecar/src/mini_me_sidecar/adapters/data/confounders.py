"""Check Confounders: one driver's coefficient alone, with controls, and within subgroups, from
the same rows, with statsmodels."""

from dataclasses import dataclass

import pandas as pd

from mini_me_sidecar.adapters.data.drivers import fit, term_driver
from mini_me_sidecar.adapters.data.tables import as_text
from mini_me_sidecar.context import TraitError

MAX_SUBGROUPS = 10

MIN_SUBGROUP_ROWS = 10

COLUMNS = ["Estimate", "Coefficient", "Low", "High", "Rows"]


@dataclass
class Confounding:
    estimates: pd.DataFrame
    alone: float
    adjusted: float | None


def check(
    frame: pd.DataFrame,
    outcome: str,
    focus: str,
    controls: list[str],
    subgroups: str | None,
) -> Confounding:
    rows = frame.dropna(subset=[outcome, focus, *controls, *([subgroups] if subgroups else [])])
    alone = _estimate("Alone", rows, outcome, [focus])
    found = [alone]
    adjusted = None
    if controls:
        adjusted = _estimate("With " + ", ".join(controls), rows, outcome, [focus, *controls])
        found.append(adjusted)
    if subgroups:
        found += _within(rows, outcome, [focus, *controls], subgroups)
    return Confounding(
        pd.DataFrame(found, columns=COLUMNS),
        alone["Coefficient"],
        adjusted["Coefficient"] if adjusted else None,
    )


def _within(
    rows: pd.DataFrame, outcome: str, drivers: list[str], subgroups: str
) -> list[dict[str, object]]:
    labels = as_text(rows[subgroups])
    counts = labels.value_counts()
    counts = counts[counts >= MIN_SUBGROUP_ROWS]
    if len(counts) > MAX_SUBGROUPS:
        raise TraitError(
            "too_many_subgroups",
            f"`{subgroups}` has {len(counts)} subgroups with {MIN_SUBGROUP_ROWS} rows or more, "
            f"and I look within at most {MAX_SUBGROUPS}.",
        )
    found = []
    for label in sorted(counts.index):
        try:
            found.append(
                _estimate(f"{subgroups} = {label}", rows[labels == label], outcome, drivers)
            )
        except TraitError:
            continue
    return found


def _estimate(
    name: str, rows: pd.DataFrame, outcome: str, drivers: list[str]
) -> dict[str, object]:
    fitted, _, used = fit(rows, outcome, drivers)
    term = next(t for t in fitted.params.index if term_driver(t) == "x0")
    low, high = fitted.conf_int().loc[term]
    return {
        "Estimate": name,
        "Coefficient": float(fitted.params[term]),
        "Low": float(low),
        "High": float(high),
        "Rows": used,
    }

