"""Searches CIP Dataverse: the model writes the search, the core runs it, and the datasets show
as a `dataset-results` component."""

from typing import Any

from pydantic import BaseModel, Field

from mini_me_sidecar.adapters.base import (
    TEXT_INPUT,
    Adapter,
    AdapterInfo,
    component_or_text,
    require_model,
)
from mini_me_sidecar.adapters.providers import PROVIDER_NAMES, ask_structured
from mini_me_sidecar.context import CallContext, TraitError
from mini_me_sidecar.tools.components import show_datasets


class DataverseSearch(BaseModel):
    """A search of CIP Dataverse's datasets."""

    query: str = Field(
        description="Keywords for the datasets the message asks for, such as 'late blight "
        "Peru', without filler words or years."
    )
    from_year: int | None = Field(
        None, description="The earliest year of publication, only when the message asks for one."
    )
    to_year: int | None = Field(
        None, description="The latest year of publication, only when the message asks for one."
    )


def search_params(search: DataverseSearch) -> dict[str, Any]:
    """The params of the core's `dataverse.search` for the first page of `search`. An empty
    query searches everything, and years given the wrong way round are swapped."""
    years = [search.from_year, search.to_year]
    if None not in years and years[0] > years[1]:  # type: ignore[operator]
        years.reverse()
    return {
        "query": search.query.strip() or "*",
        "from_year": years[0],
        "to_year": years[1],
        "start": 0,
    }


def datasets_text(datasets: list[dict[str, Any]]) -> str:
    """The datasets as a Markdown list, for a reply whose component was refused."""
    lines = []
    for number, dataset in enumerate(datasets, start=1):
        year = f" ({dataset['year']})" if dataset.get("year") else ""
        authors = ", ".join(dataset.get("authors") or [])
        details = ", ".join(d for d in (authors, dataset.get("url") or "") if d)
        line = f"{number}. **{dataset['title']}**{year}"
        lines.append(line + (f": {details}" if details else ""))
    return "\n".join(lines)


async def _write_search(ctx: CallContext, text: str) -> DataverseSearch:
    model = require_model(ctx)
    turns = [("system", ctx.trait.instructions or ""), ("human", text)]
    answer = await ask_structured(ctx, DataverseSearch, turns)
    if not isinstance(answer, DataverseSearch):
        raise TraitError(
            "provider_empty",
            f"{model.model} gave no usable answer. Try again, or choose another model in "
            "Settings.",
        )
    return answer


class SearchDataverse(Adapter):
    uses_tools = ("show_datasets",)
    info = AdapterInfo(
        id="cip-dataverse",
        description="Searches CIP's Dataverse for datasets, which the user can download.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        ctx.progress("Writing the search")
        search = search_params(await _write_search(ctx, str(input.get("text", ""))))
        ctx.progress("Searching CIP Dataverse")
        page = await ctx.search_dataverse(search)
        datasets = page.get("datasets") or []
        total = int(page.get("total") or 0)
        if not datasets:
            ctx.write("No datasets were found. Try other or fewer keywords.")
            return
        ctx.write(f"Found {total:,} {'dataset' if total == 1 else 'datasets'}.")
        data = {**search, "total": total, "datasets": datasets}
        await component_or_text(ctx, show_datasets, data, datasets_text(datasets), "dataverse")
