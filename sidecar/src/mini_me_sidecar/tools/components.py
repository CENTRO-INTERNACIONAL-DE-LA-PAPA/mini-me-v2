"""Showing charts and provider results (tables are in `tools.tables`), and reading any component
back."""

import json
from typing import Any

from mini_me_sidecar.context import CallContext, CoreRequestError
from mini_me_sidecar.tools.base import ToolError, add_component
from mini_me_sidecar.tools.files import save_file

READ_FILE_NOTE = "The component's data is in its source file; read it with read_file."


async def show_chart(
    ctx: CallContext, preview: dict[str, Any], text: str, source_asset_id: str | None
) -> str:
    return await add_component(ctx, "chart", preview, text, source_asset_id)


async def show_results(
    ctx: CallContext, kind: str, file_name: str, results: Any, preview: Any, text: str
) -> str:
    """Saves a provider's `results` as the hidden JSON file `file_name`, then shows them as a
    `kind` component whose source is that file; returns the component's ID."""
    data = json.dumps(results, ensure_ascii=False).encode()
    saved = await save_file(ctx, file_name, "application/json", data, hidden=True)
    return await add_component(ctx, kind, preview, text, saved["asset_id"])


async def read_component(ctx: CallContext, component_id: str) -> dict[str, Any]:
    """One of the Conversation's components as a model reads it: its kind, its text and the ID
    of the file holding its data."""
    ctx.progress("Reading a component")
    try:
        component = await ctx.read_component(component_id)
    except CoreRequestError as error:
        raise ToolError(
            f"No component with the ID {component_id} in this Conversation.", error.code
        ) from None
    return component_result(component)


def component_result(component: dict[str, Any]) -> dict[str, Any]:
    result = {"kind": component.get("kind"), "text": component.get("text")}
    if component.get("source_asset_id"):
        result["source_asset_id"] = component["source_asset_id"]
        result["note"] = READ_FILE_NOTE
    return result
