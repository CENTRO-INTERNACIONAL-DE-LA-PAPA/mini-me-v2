"""Chart templates: one JSON file per chart type in `chart_templates/`, a chart description with
`{slot}` gaps. The model chooses a template and fills its slots; Plot checks and fills them."""

import json
from importlib import resources
from typing import Any, Literal

import pandas as pd
from pydantic import BaseModel, Field, model_validator

from mini_me_sidecar.adapters.data.charts import (
    MAX_HEIGHT,
    Channel,
    ChartDescription,
    Group,
    Mark,
    MarkOption,
    Scale,
)

ColumnType = Literal["number", "text", "date", "boolean"]

# Pixels per panel when a facet splits a chart without a height of its own.
FACET_PANEL = 160

FACET_TYPES = ("text", "boolean", "number")

TEMPLATE_SLOTS = ("x", "y", "category", "value", "group", "columns")


class SlotSpec(BaseModel):
    types: list[ColumnType]
    required: bool = True


class Template(BaseModel):
    """`slots` maps a slot of `ChartChoice` (`x`, `y`, `category`, `value`, `group` or
    `columns`) to the column types it takes; `chart` is a `ChartDescription` without its title,
    whose strings may hold `{slot}` and `{aggregate}` gaps."""

    name: str
    description: str
    slots: dict[str, SlotSpec]
    value_axis: Literal["x", "y"] = "y"
    facets: bool = True
    chart: dict[str, Any]


class ChartChoice(BaseModel):
    """One chart: a template from the list, its title, the columns in that template's slots,
    and the style slots, which every template takes. Leave a style slot empty unless the user
    asks for that style."""

    template: str
    title: str
    x: str | None = None
    y: str | None = None
    category: str | None = None
    value: str | None = None
    group: str | None = None
    columns: list[str] = []
    aggregate: Literal["count", "sum", "mean", "median", "min", "max"] | None = Field(
        None, description="How a template that aggregates combines values; mean when empty"
    )
    colour: str | None = Field(
        None, description="A CSS colour name or hex colour, only when the user names a colour"
    )
    scheme: str | None = Field(
        None, description="An Observable Plot colour scheme, only when the user names one"
    )
    log_x: bool = False
    log_y: bool = False
    reference: float | None = Field(None, description="A value to draw a reference line at")
    height: int | None = Field(None, description="The chart's height in pixels")
    sort: Literal["value", "label"] | None = Field(
        None, description="Order categories by their value (the default) or by their name"
    )
    facet: str | None = Field(None, description="A column to draw one panel per value of")

    @model_validator(mode="before")
    @classmethod
    def _without_unused_slots(cls, data: Any) -> Any:
        """Clears the slots its template does not have, so a stray value there can't sink it."""
        name = data.get("template") if isinstance(data, dict) else None
        template = TEMPLATES.get(name) if isinstance(name, str) else None
        if template is None:
            return data
        unused = {s for s in TEMPLATE_SLOTS if s not in template.slots}
        if not uses_aggregate(template):
            unused.add("aggregate")
        return {k: v for k, v in data.items() if k not in unused}


class ChartPlan(BaseModel):
    """The charts to draw: the fewest that answer the message."""

    charts: list[ChartChoice]


def _load() -> dict[str, Template]:
    folder = resources.files(__package__) / "chart_templates"
    files = sorted((f for f in folder.iterdir() if f.name.endswith(".json")), key=lambda f: f.name)
    templates = [Template.model_validate_json(f.read_text(encoding="utf-8")) for f in files]
    return {t.name: t for t in templates}


TEMPLATES = _load()


def uses_aggregate(template: Template) -> bool:
    return "{aggregate}" in json.dumps(template.chart)


def templates_text() -> str:
    """The templates as the model reads them: name, description and slots."""
    lines = ["The chart templates, with the slots each takes:"]
    for template in TEMPLATES.values():
        slots = [
            f"{name} ({' or '.join(spec.types)}{'' if spec.required else ', optional'})"
            for name, spec in template.slots.items()
        ]
        if uses_aggregate(template):
            slots.append("aggregate")
        extra = "" if template.facets else " No facet."
        lines.append(f"- {template.name}: {template.description} Slots: {', '.join(slots)}.{extra}")
    return "\n".join(lines)


def choice_problem(choice: ChartChoice, types: dict[str, str]) -> str | None:
    """Why `choice` can't be drawn from a table whose columns have `types`, or None."""
    template = TEMPLATES.get(choice.template)
    if template is None:
        return f"no chart template `{choice.template}`"
    for slot, spec in template.slots.items():
        filled = getattr(choice, slot)
        names = filled if slot == "columns" else [filled] if filled else []
        if not names:
            if spec.required:
                return f"the {slot} slot is empty"
            continue
        if slot == "columns" and len(set(names)) < 2:
            return "the columns slot needs at least 2 columns"
        for name in names:
            if name not in types:
                return f"no column `{name}`"
            if types[name] not in spec.types:
                needs = " or ".join(spec.types)
                return f"`{name}` is a {types[name]} column, and the {slot} slot needs {needs}"
    if choice.facet is not None:
        if choice.facet not in types:
            return f"no column `{choice.facet}`"
        if types[choice.facet] not in FACET_TYPES:
            return f"`{choice.facet}` is a {types[choice.facet]} column, which can't split panels"
    return None


class _Missing:
    """An empty optional slot: the list item or object holding it is left out."""


MISSING = _Missing()


def fill_template(
    choice: ChartChoice, table: pd.DataFrame
) -> tuple[ChartDescription, list[tuple[str, str]]]:
    """The chart of a checked `choice`, with its style slots applied, and the style slots it
    ignored with their reasons."""
    template = TEMPLATES[choice.template]
    slots: dict[str, Any] = {name: getattr(choice, name) for name in template.slots}
    if "columns" in slots:
        slots["columns"] = list(dict.fromkeys(slots["columns"])) or None
    slots["aggregate"] = choice.aggregate or "mean"
    filled = _fill(template.chart, slots)
    chart = ChartDescription.model_validate({**filled, "title": choice.title})
    return _style(chart, choice, template, table)


def _fill(node: Any, slots: dict[str, Any]) -> Any:
    if isinstance(node, str):
        if node.startswith("{") and node.endswith("}") and node[1:-1] in slots:
            value = slots[node[1:-1]]
            return MISSING if value is None else value
        for name, value in slots.items():
            if "{" + name + "}" in node:
                if value is None:
                    return MISSING
                node = node.replace("{" + name + "}", str(value))
        return node
    if isinstance(node, list):
        items = []
        for item in node:
            filled = _fill(item, slots)
            if filled is MISSING:
                continue
            # A `{columns}` gap inside a list stands for its columns, one item each.
            if isinstance(item, str) and isinstance(filled, list):
                items.extend(filled)
            else:
                items.append(filled)
        return items
    if isinstance(node, dict):
        filled = {key: _fill(value, slots) for key, value in node.items()}
        return MISSING if any(v is MISSING for v in filled.values()) else filled
    return node


def _style(
    chart: ChartDescription, choice: ChartChoice, template: Template, table: pd.DataFrame
) -> tuple[ChartDescription, list[tuple[str, str]]]:
    ignored: list[tuple[str, str]] = []
    scales = list(chart.scales)
    marks = list(chart.marks)
    if choice.scheme:
        scales = _set_scale(scales, "color", scheme=choice.scheme)
    if choice.log_x:
        scales = _set_scale(scales, "x", type="log")
    if choice.log_y:
        scales = _set_scale(scales, "y", type="log")
    if choice.sort == "label":
        marks = [
            m.model_copy(update={"options": [o for o in m.options if o.name != "sort"]})
            for m in marks
        ]
    if choice.reference is not None:
        marks.append(_reference(choice.reference, template.value_axis))
    datasets = chart.datasets
    height = choice.height or chart.height
    if choice.facet is not None:
        if template.facets:
            datasets, marks = _facet(datasets, marks, choice.facet)
            panels = int(table[choice.facet].nunique())
            height = choice.height or min(MAX_HEIGHT, max(height or 0, FACET_PANEL * panels))
        else:
            ignored.append((f"facet {choice.facet}", f"a {template.name} chart has no panels"))
    styled = chart.model_copy(
        update={
            "scales": scales,
            "marks": marks,
            "datasets": datasets,
            "height": height,
            "colour": choice.colour,
        }
    )
    return styled, ignored


def _set_scale(scales: list[Scale], name: str, **options: Any) -> list[Scale]:
    found = next((s for s in scales if s.scale == name), None)
    updated = found.model_copy(update=options) if found else Scale(scale=name, **options)
    return [s for s in scales if s is not found] + [updated]


def _reference(value: float, axis: str) -> Mark:
    return Mark(
        mark="ruleY" if axis == "y" else "ruleX",
        values=[value],
        channels=[Channel(name="stroke", value="currentColor")],
        options=[MarkOption(name="strokeDasharray", value="4 3")],
    )


def _facet(datasets: list[Any], marks: list[Mark], column: str) -> tuple[list[Any], list[Mark]]:
    """Adds `column` to every group, and a panel channel to every mark drawing a dataset: `fy`,
    or `fx` when the chart already uses `fy`."""
    grouped = []
    for dataset in datasets:
        operations = [
            o.model_copy(update={"by": [*o.by, column]})
            if isinstance(o, Group) and column not in o.by
            else o
            for o in dataset.operations
        ]
        grouped.append(dataset.model_copy(update={"operations": operations}))
    taken = any(c.name == "fy" for m in marks for c in m.channels)
    panel = Channel(name="fx" if taken else "fy", column=column)
    marks = [
        m.model_copy(update={"channels": [*m.channels, panel]}) if m.dataset else m
        for m in marks
    ]
    return grouped, marks


def choice_text(choice: ChartChoice) -> str:
    """The template, its slots and the style slots in words, for the chart's text."""
    template = TEMPLATES[choice.template]
    slots = []
    for name in template.slots:
        filled = getattr(choice, name)
        if filled:
            slots.append(f"{name} {', '.join(filled) if name == 'columns' else filled}")
    if uses_aggregate(template):
        slots.append(f"aggregate {choice.aggregate or 'mean'}")
    style = [
        f"colour {choice.colour}" if choice.colour else "",
        f"scheme {choice.scheme}" if choice.scheme else "",
        "log x" if choice.log_x else "",
        "log y" if choice.log_y else "",
        f"reference line at {choice.reference:g}" if choice.reference is not None else "",
        f"height {choice.height} px" if choice.height else "",
        f"sorted by {choice.sort}" if choice.sort else "",
        f"one panel per {choice.facet}" if choice.facet else "",
    ]
    shown = [s for s in style if s]
    text = f"Chart template {template.name}: {', '.join(slots)}."
    return text + (f" Style: {', '.join(shown)}." if shown else "")
