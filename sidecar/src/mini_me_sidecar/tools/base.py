"""What the tools share: their error, and the core requests several of them need."""

from typing import Any

from mini_me_sidecar.context import CallContext, CoreRequestError, TraitError


class ToolError(TraitError):
    """A tool could not do what it was asked; the message says why. Left uncaught in an
    adapter, it ends the call with `code`, like any `TraitError`; the `prompt` adapter instead
    returns the message to its model. `code` is the core's code when the core refused the
    request."""

    def __init__(self, message: str, code: str = "tool_failed") -> None:
        super().__init__(code, message)


async def add_component(ctx: CallContext, kind: str, data: Any, text: str) -> str:
    """Adds a version 1 component of `kind` and returns its ID."""
    try:
        return await ctx.component(kind, 1, data, text)
    except CoreRequestError as error:
        raise ToolError(f"The {kind} was not shown: {error}", error.code) from None


async def find_asset(ctx: CallContext, asset_id: str) -> dict[str, Any]:
    """The Conversation's Asset `asset_id`, `{ id, name, media_type, ... }`."""
    found = await ctx.results()
    for asset in found.get("assets") or []:
        if str(asset.get("id")) == asset_id:
            return asset
    raise ToolError(f"No file with the ID {asset_id} in this Conversation.", "not_found")
