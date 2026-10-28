"""The data Traits' adapters: fixed tools over CSV, TSV and Excel tables. The AI model only
chooses entries from fixed lists; pandas and pointblank compute every result."""

from typing import Any

from mini_me_sidecar.adapters.base import Adapter, AdapterInfo
from mini_me_sidecar.adapters.providers import PROVIDER_NAMES
from mini_me_sidecar.context import CallContext

INPUT_SCHEMA = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
}


class ProfileData(Adapter):
    uses_tools = ("read_table", "show_table")
    info = AdapterInfo(
        id="data-profile",
        description="Describes tables with pandas, without an AI model.",
        input_schema=INPUT_SCHEMA,
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand: pandas and pointblank take about a second to load, and most
        # calls never need them.
        from mini_me_sidecar.adapters.data import replies

        await replies.profile(ctx, str(input.get("text", "")))


class ValidateData(Adapter):
    uses_tools = ("read_table", "show_table", "save_file")
    info = AdapterInfo(
        id="data-validate",
        description="Runs default and chosen data checks with pointblank.",
        input_schema=INPUT_SCHEMA,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.validate(ctx, str(input.get("text", "")))


class CleanData(Adapter):
    uses_tools = ("read_table", "show_table", "save_file")
    info = AdapterInfo(
        id="data-clean",
        description="Applies chosen cleaning actions with pandas and saves a new file.",
        input_schema=INPUT_SCHEMA,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.clean(ctx, str(input.get("text", "")))


class JoinData(Adapter):
    uses_tools = ("read_table", "show_table", "save_file")
    info = AdapterInfo(
        id="data-join",
        description="Joins two tables on key columns with pandas.",
        input_schema=INPUT_SCHEMA,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.join_tables(ctx, str(input.get("text", "")))


class PlotData(Adapter):
    uses_tools = ("read_table", "show_chart")
    info = AdapterInfo(
        id="data-plot",
        description="Draws charts of a table, with values computed by pandas.",
        input_schema=INPUT_SCHEMA,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.plot(ctx, str(input.get("text", "")))
