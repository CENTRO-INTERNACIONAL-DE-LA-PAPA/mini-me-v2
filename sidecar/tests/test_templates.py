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
    slots_text,
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

    assert problem(template="pie", category="variety") == "no chart template `pie`"
    assert problem(template="bar", category="variety") == "the value slot is empty"
    assert "text column" in problem(template="bar", category="variety", value="variety")
    assert problem(template="bar", category="variety", value="heigth") == "no column `heigth`"
    heatmap = {"template": "correlation_heatmap"}
    assert "at least 2" in problem(**heatmap, correlated_columns=["yield", "yield"])
    assert "can't split panels" in problem(template="scatter", x="yield", y="height", facet="day")
    assert problem(template="line", x="day", y="yield") is None


def test_slots_the_template_does_not_have_are_ignored():
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


def test_slots_text_names_empty_optional_slots():
    scatter = choose(template="scatter", x="blight", y="yield")
    assert slots_text(scatter) == "x blight, y yield, no group"
    bars = choose(template="bar", category="variety", value="yield", aggregate="sum")
    assert slots_text(bars) == "category variety, value yield, aggregate sum"


def test_an_empty_optional_slot_leaves_out_what_uses_it():
    chart, _ = fill_template(choose(template="line", x="day", y="yield"), TABLE)
    assert chart.datasets[0].operations[0].by == ["day"]
    assert all(c.name != "stroke" for c in chart.marks[0].channels)

    chart, _ = fill_template(choose(template="line", x="day", y="yield", group="site"), TABLE)
    assert chart.datasets[0].operations[0].by == ["day", "site"]
    assert any(c.name == "stroke" and c.column == "site" for c in chart.marks[0].channels)


def test_style_slots_apply_to_any_template():
    choice = choose(
        template="bar",
        category="variety",
        value="yield",
        colour="steelblue",
        log_y=True,
        reference=20,
        sort="label",
        facet="site",
    )
    chart, ignored = fill_template(choice, TABLE)
    assert ignored == [] and chart.colour == "steelblue"
    assert [(s.scale, s.type) for s in chart.scales] == [("y", "log")]
    assert all(o.name != "sort" for m in chart.marks for o in m.options)
    reference = chart.marks[-1]
    assert (reference.mark, reference.values) == ("ruleY", [20.0])
    assert chart.datasets[0].operations[0].by == ["variety", "site"]
    assert any(c.name == "fy" and c.column == "site" for c in chart.marks[0].channels)
    assert chart.height == 320

    bars = {"template": "bar", "category": "variety", "value": "yield"}
    chart, ignored = fill_template(
        choose(**bars, scheme="rainbowz", colour="red; x", height=5000), TABLE
    )
    assert [label for label, _ in ignored] == ["scheme rainbowz", "colour red; x"]
    assert chart.colour is None and chart.height == 800

    heatmap = choose(
        template="correlation_heatmap", correlated_columns=["yield", "height"], facet="site"
    )
    _, ignored = fill_template(heatmap, TABLE)
    assert [label for label, _ in ignored] == ["facet site"]


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
        gaps = set(re.findall(r"\{(\w+)\}", text)) - {"aggregate"}
        assert gaps <= set(template.slots), template.name
        for mark in template.chart["marks"]:
            assert mark["mark"] in MARKS, template.name
            assert {c["name"] for c in mark.get("channels", [])} <= CHANNELS, template.name
            assert {o["name"] for o in mark.get("options", [])} <= OPTIONS, template.name
        for slot in colour_slots(template) - {"correlated_columns"}:
            assert "number" in template.slots[slot].types, (template.name, slot)
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


def test_a_number_group_is_coloured_as_categories():
    choice = choose(template="scatter", x="yield", y="height", group="block")
    chart, _ = fill_template(choice, TABLE)
    data = build_chart(TABLE, chart).data
    columns = {c["name"]: c["type"] for d in data["datasets"].values() for c in d["columns"]}
    assert columns["block"] == "text"
    colour = next(s for s in data["description"]["scales"] if s["scale"] == "color")
    assert colour["domain"] == ["1", "2"] and "categories" not in data["description"]
