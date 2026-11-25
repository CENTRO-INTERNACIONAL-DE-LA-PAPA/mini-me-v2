"""Chart descriptions for tests, with the optional fields spelled out."""

from typing import Any

from mini_me_sidecar.adapters.data.charts import ChartDescription


def dataset(name: str, *operations: dict[str, Any]) -> dict[str, Any]:
    return {"name": name, "operations": list(operations)}


def mark(
    name: str, data: str | None, values: list[Any] | None = None, **channels: Any
) -> dict[str, Any]:
    """`channels` name a column, or hold a constant when given as `("value", constant)`."""
    listed = [
        {"name": c, "column": None, "value": v[1]}
        if isinstance(v, tuple)
        else {"name": c, "column": v, "value": None}
        for c, v in channels.items()
    ]
    return {
        "mark": name,
        "dataset": data,
        "values": values or [],
        "channels": listed,
        "options": [],
    }


def scale(name: str, **options: Any) -> dict[str, Any]:
    return {"scale": name, **options}


def chart(
    datasets: list[dict[str, Any]], marks: list[dict[str, Any]], scales: list[Any] = ()
) -> ChartDescription:
    return ChartDescription.model_validate(
        {"title": "t", "height": None, "datasets": datasets, "marks": marks, "scales": list(scales)}
    )
