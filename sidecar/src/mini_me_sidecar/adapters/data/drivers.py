"""Find Drivers: a linear regression of an outcome on candidate drivers, with statsmodels."""

import re
from dataclasses import dataclass

import pandas as pd
import statsmodels.formula.api as smf
from statsmodels.stats.outliers_influence import variance_inflation_factor

from mini_me_sidecar.adapters.data.tables import as_text, column_type
from mini_me_sidecar.context import TraitError

COLUMNS = ["Term", "Coefficient", "Low", "High", "p-value", "VIF"]

CATEGORY_TERM = re.compile(r"C\((x\d+)\)\[T\.(.*)\]")


@dataclass
class Drivers:
    terms: pd.DataFrame
    r_squared: float
    rows: int
    left_out: int


def regress(frame: pd.DataFrame, outcome: str, drivers: list[str]) -> Drivers:
    fitted, names, rows = fit(frame, outcome, drivers)
    vif = _vif(fitted)
    found = []
    for term in fitted.params.index:
        if term == "Intercept":
            continue
        driver, label = _term(term, names)
        low, high = fitted.conf_int().loc[term]
        found.append(
            {
                "driver": driver,
                "Term": label,
                "Coefficient": float(fitted.params[term]),
                "Low": float(low),
                "High": float(high),
                "p-value": float(fitted.pvalues[term]),
                "VIF": vif.get(driver),
            }
        )
    order = list(names)
    found.sort(key=lambda term: order.index(term.pop("driver")))
    return Drivers(
        pd.DataFrame(found, columns=COLUMNS), float(fitted.rsquared), rows, len(frame) - rows
    )


def fit(frame: pd.DataFrame, outcome: str, drivers: list[str]):
    names = {f"x{i}": driver for i, driver in enumerate(drivers)}
    data = pd.DataFrame({"y": frame[outcome]})
    terms = []
    for name, driver in names.items():
        if column_type(frame[driver]) in ("text", "boolean"):
            data[name] = as_text(frame[driver])
            terms.append(f"C({name})")
        else:
            data[name] = frame[driver]
            terms.append(name)
    data = data.dropna()
    model = smf.ols(f"y ~ {' + '.join(terms)}", data=data)
    if len(data) <= model.exog.shape[1]:
        raise TraitError(
            "too_few_rows",
            f"Only {len(data)} rows have every value, too few for {model.exog.shape[1]} terms.",
        )
    return model.fit(), names, len(data)


def _vif(fitted) -> dict[str, float]:
    exog = fitted.model.exog
    found: dict[str, float] = {}
    for i, term in enumerate(fitted.model.exog_names):
        if term == "Intercept":
            continue
        value = 1.0 if exog.shape[1] <= 2 else float(variance_inflation_factor(exog, i))
        driver = CATEGORY_TERM.match(term).group(1) if CATEGORY_TERM.match(term) else term
        found[driver] = max(found.get(driver, 0.0), value)
    return found


def _term(term: str, names: dict[str, str]) -> tuple[str, str]:
    if match := CATEGORY_TERM.match(term):
        return match.group(1), f"{names[match.group(1)]} = {match.group(2)}"
    return term, names[term]
