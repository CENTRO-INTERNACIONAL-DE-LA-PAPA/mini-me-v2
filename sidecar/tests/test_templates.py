import re

import pandas as pd
import pytest
from pydantic import ValidationError

from mini_me_sidecar.adapters.data.charts import MARKS, check_chart
from mini_me_sidecar.adapters.data.plot import build_chart
from mini_me_sidecar.adapters.data.templates import (
    TEMPLATES,
    ChartChoice,
    choice_problem,
    fill_template,
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
}
# A column of each type, for filling any template's slots in the format test.
BY_TYPE = {"text": "variety", "number": "yield", "date": "day", "boolean": "ok"}


def choose(**fields) -> ChartChoice:
    return ChartChoice(title="t", **fields)


def test_slots_must_name_columns_of_the_types_they_take():
    def problem(**fields) -> str | None:
        return choice_problem(choose(**fields), TYPES)

    assert problem(template="pie", category="variety") == "no chart template `pie`"
    assert problem(template="bar", category="variety") == "the value slot is empty"
    assert "text column" in problem(template="bar", category="variety", value="variety")
    assert problem(template="bar", category="variety", value="heigth") == "no column `heigth`"
    assert "at least 2" in problem(template="correlation_heatmap", columns=["yield", "yield"])
    assert "can't split panels" in problem(template="scatter", x="yield", y="height", facet="day")
    assert problem(template="line", x="day", y="yield") is None


def test_slots_the_template_does_not_have_are_ignored():
    stray = {"columns": [{"name": "yield"}], "aggregate": "average"}
    choice = ChartChoice.model_validate(
        {"template": "histogram", "title": "t", "value": "yield", **stray}
    )
    assert choice.columns == [] and choice.aggregate is None
    assert choice_problem(choice, TYPES) is None

    with pytest.raises(ValidationError):
        ChartChoice.model_validate({"template": "correlation_heatmap", "title": "t", **stray})


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

    heatmap = choose(template="correlation_heatmap", columns=["yield", "height"], facet="site")
    _, ignored = fill_template(heatmap, TABLE)
    assert [label for label, _ in ignored] == ["facet site"]


def test_every_template_loads_fills_and_draws():
    for template in TEMPLATES.values():
        text = template.model_dump_json()
        gaps = set(re.findall(r"\{(\w+)\}", text)) - {"aggregate"}
        assert gaps <= set(template.slots), template.name
        assert {m["mark"] for m in template.chart["marks"]} <= MARKS, template.name
        fields = {
            slot: (["yield", "height"] if slot == "columns" else BY_TYPE[spec.types[0]])
            for slot, spec in template.slots.items()
        }
        # Slots that take text take different columns, so a group differs from a category.
        if "group" in fields and fields.get("category") == fields["group"]:
            fields["group"] = "season"
        choice = choose(template=template.name, **fields)
        assert choice_problem(choice, TYPES) is None, template.name
        chart, _ = fill_template(choice, TABLE)
        checked = check_chart(chart, TYPES)
        assert checked.ignored == [] and checked.chart is not None, template.name
        assert build_chart(TABLE, checked.chart).fits, template.name
