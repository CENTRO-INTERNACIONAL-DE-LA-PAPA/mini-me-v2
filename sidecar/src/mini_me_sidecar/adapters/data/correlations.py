"""Find Correlations: the correlation of each pair of number columns, with scipy's p-values."""

from itertools import combinations
from typing import Literal

import pandas as pd
from scipy import stats

Method = Literal["pearson", "spearman"]

COLUMNS = ["Column A", "Column B", "Coefficient", "Rows", "p-value"]


def compared(frame: pd.DataFrame, columns: list[str], method: Method) -> pd.DataFrame:
    """The values each coefficient is Pearson's of: Spearman's ranks each column as a whole,
    so the heatmap, which takes Pearson's of what it is given, shows the same coefficients."""
    values = frame[columns].astype(float)
    return values.rank() if method == "spearman" else values


def correlations(frame: pd.DataFrame, columns: list[str], method: Method) -> pd.DataFrame:
    """One row per pair, strongest first; a pair without two varying values has no coefficient."""
    values = compared(frame, columns, method)
    rows = []
    for a, b in combinations(columns, 2):
        both = values[[a, b]].dropna()
        coefficient = p_value = None
        if len(both) > 2 and both[a].nunique() > 1 and both[b].nunique() > 1:
            result = stats.pearsonr(both[a], both[b])
            coefficient, p_value = round(float(result.statistic), 4), float(result.pvalue)
        rows.append(dict(zip(COLUMNS, [a, b, coefficient, len(both), p_value])))
    table = pd.DataFrame(rows, columns=COLUMNS)
    strength = table["Coefficient"].abs().sort_values(ascending=False, na_position="last")
    return table.loc[strength.index].reset_index(drop=True)
