"""The data Traits: the model only picks from fixed lists; pandas and pointblank compute results."""

from typing import Any

from mini_me_sidecar.adapters.base import TEXT_INPUT, Adapter, AdapterInfo
from mini_me_sidecar.adapters.providers import PROVIDER_NAMES
from mini_me_sidecar.context import CallContext


class ProfileData(Adapter):
    info = AdapterInfo(
        id="data-profile",
        description="Describes tables with pandas, without an AI model.",
        input_schema=TEXT_INPUT,
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported here: pandas and pointblank take a second to load, and most calls skip them.
        from mini_me_sidecar.adapters.data import replies

        await replies.profile(ctx, str(input.get("text", "")))


class ValidateData(Adapter):
    info = AdapterInfo(
        id="data-validate",
        description="Runs default and chosen data checks with pointblank.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.validate(ctx, str(input.get("text", "")))


class CleanData(Adapter):
    info = AdapterInfo(
        id="data-clean",
        description="Applies chosen cleaning actions with pandas and saves a new file.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.clean(ctx, str(input.get("text", "")))


class JoinData(Adapter):
    info = AdapterInfo(
        id="data-join",
        description="Joins two tables on key columns with pandas.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.join_tables(ctx, str(input.get("text", "")))


class DescribeVariables(Adapter):
    info = AdapterInfo(
        id="data-describe-variables",
        description="Describes each column of a table by its type, with distribution charts.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.describe_variables(ctx, str(input.get("text", "")))


class FindCorrelations(Adapter):
    info = AdapterInfo(
        id="data-correlations",
        description="Correlates the number columns of a table pairwise, with scipy.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.find_correlations(ctx, str(input.get("text", "")))


class DetectOutliers(Adapter):
    info = AdapterInfo(
        id="data-outliers",
        description="Flags unusual values and rows of a table, with pandas and scikit-learn.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.detect_outliers(ctx, str(input.get("text", "")))


class FindClusters(Adapter):
    info = AdapterInfo(
        id="data-clusters",
        description="Groups similar rows of a table with scikit-learn and saves the groups.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.find_clusters(ctx, str(input.get("text", "")))


class CompareGroups(Adapter):
    info = AdapterInfo(
        id="data-compare-groups",
        description="Compares a number column between groups, with scipy.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.compare_groups(ctx, str(input.get("text", "")))


class FindDrivers(Adapter):
    info = AdapterInfo(
        id="data-drivers",
        description="Regresses an outcome on candidate drivers with statsmodels.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.find_drivers(ctx, str(input.get("text", "")))


class PlotData(Adapter):
    info = AdapterInfo(
        id="data-plot",
        description="Draws charts of a table, with values computed by pandas.",
        input_schema=TEXT_INPUT,
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported on demand; see ProfileData.run.
        from mini_me_sidecar.adapters.data import replies

        await replies.plot(ctx, str(input.get("text", "")))
