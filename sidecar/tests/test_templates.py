import re

import pandas as pd
import pytest
from pydantic import ValidationError

from mini_me_sidecar.adapters.data.charts import STATISTICAL_MARKS, is_summarized
from mini_me_sidecar.adapters.data.plot import build_chart
from mini_me_sidecar.adapters.data.templates import (
    TEMPLATES,
    ChartChoice,
    choice_problem,
    colour_slots,
    fill_template,
    unplaced_columns,
)

TABLE = pd.DataFrame(
    {
        "variety": ["a", "a", "b", "b"],
        "season": ["s1", "s2", "s1", "s2"],
        "site": ["x", "y", "x", "y"],
        "yield": [1.0, 2, 3, 4],
        "height": [5.0, 6, 7, 9],
        "day": pd.to_datetime(["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"]),
        "ok": [True, False, True, True],
        "block": [1, 1, 1, 2],
    }
)
TYPES = {
    "variety": "text",
    "season": "text",
    "site": "text",
    "yield": "number",
    "height": "number",
    "day": "date",
    "ok": "boolean",
    "block": "number",
}
# The Observable Plot marks, channels and options a template may use: every mark but `geo`,
# `graticule`, `sphere` and `image`, which need map data or pictures, and `auto`, `tip` and
# `crosshair`, whose tooltips the app draws.
MARKS = frozenset(
    """area areaX areaY arrow axisX axisY axisFx axisFy gridX gridY gridFx gridFy barX barY
    bollingerX bollingerY boxX boxY cell cellX cellY contour delaunayLink delaunayMesh hull
    voronoi voronoiMesh density differenceX differenceY dot dotX dotY circle hexagon frame
    hexgrid line lineX lineY linearRegressionX linearRegressionY link raster rect rectX rectY
    ruleX ruleY text textX textY tickX tickY tree cluster vector vectorX vectorY spike waffleX
    waffleY""".split()
)

CHANNELS = frozenset(
    """x y x1 x2 y1 y2 fill stroke r opacity fillOpacity strokeOpacity strokeWidth symbol text
    fx fy z rotate length weight path""".split()
)

OPTIONS = frozenset(
    """curve marker markerStart markerMid markerEnd inset insetLeft insetRight insetTop
    insetBottom dx dy textAnchor lineAnchor fontSize fontWeight fontStyle lineWidth bandwidth
    thresholds interval strokeDasharray strokeLinecap rx ry frameAnchor bend headLength ci n k
    unit gap anchor shape sort""".split()
)

# A column of each type, for filling any template's slots in the format test.
BY_TYPE = {"text": "variety", "number": "yield", "date": "day", "boolean": "ok"}
# Another column of each type, for a second slot of the same type.
OTHER_BY_TYPE = {"text": "season", "number": "block", "date": "day", "boolean": "ok"}


def choose(**fields) -> ChartChoice:
    return ChartChoice(title="t", **fields)


def test_slots_must_name_columns_of_the_types_they_take():
    def problem(**fields) -> str | None:
        return choice_problem(choose(**fields), TYPES)

    assert problem(template="pie", category="variety")
    assert problem(template="bar", category="variety")
    assert problem(template="bar", category="variety", value="variety")
    assert problem(template="bar", category="variety", value="heigth")
    assert problem(template="correlation_heatmap", correlated_columns=["yield", "yield"])
    assert problem(template="scatter", x="yield", y="height", facet="day")
    assert problem(template="line", x="day", y="yield") is None

    stray = {"correlated_columns": [{"name": "yield"}], "aggregate": "average"}
    choice = ChartChoice.model_validate(
        {"template": "histogram", "title": "t", "value": "yield", **stray}
    )
    assert choice.correlated_columns == [] and choice.aggregate is None
    assert choice_problem(choice, TYPES) is None

    misplaced = {"correlated_columns": ["yield", "block"], "facet": "site"}
    choice = choose(template="scatter", x="yield", y="height", **misplaced)
    assert unplaced_columns(choice) == ["block"]

    with pytest.raises(ValidationError):
        ChartChoice.model_validate({"template": "correlation_heatmap", "title": "t", **stray})


def fillings(template):
    """The slots filled with their first type, then each slot with each of its other types."""
    first = {
        slot: (["yield", "height"] if slot == "correlated_columns" else BY_TYPE[spec.types[0]])
        for slot, spec in template.slots.items()
    }
    if "group" in first and first.get("category") == first["group"]:
        first["group"] = "season"
    yield first
    for slot, spec in template.slots.items():
        if slot != "correlated_columns":
            yield from ({**first, slot: OTHER_BY_TYPE[kind]} for kind in spec.types[1:])


def test_every_template_loads_fills_and_draws():
    for template in TEMPLATES.values():
        text = template.model_dump_json()
        gaps = set(re.findall(r"\{(\w+)\}", text)) - {"aggregate", "Aggregate"}
        assert gaps <= set(template.slots), template.name
        for mark in template.chart["marks"]:
            assert mark["mark"] in MARKS, template.name
            assert {c["name"] for c in mark.get("channels", [])} <= CHANNELS, template.name
            assert {o["name"] for o in mark.get("options", [])} <= OPTIONS, template.name
        for slot in colour_slots(template) - {"correlated_columns"}:
            assert "number" in template.slots[slot].types, (template.name, slot)
        if template.internal:
            continue
        for fields in fillings(template):
            label = (template.name, fields)
            choice = choose(template=template.name, **fields)
            assert choice_problem(choice, TYPES) is None, label
            chart, ignored = fill_template(choice, TABLE)
            assert ignored == [], label
            own_rows = {d.name for d in chart.datasets if not is_summarized(d)}
            statistical = [m for m in chart.marks if m.mark in STATISTICAL_MARKS]
            assert all(m.dataset in own_rows for m in statistical), label
            assert build_chart(TABLE, chart).fits, label

