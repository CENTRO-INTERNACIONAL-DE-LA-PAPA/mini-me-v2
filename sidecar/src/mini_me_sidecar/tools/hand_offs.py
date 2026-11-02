"""Handing part of a request to another Mini-Me, which answers once the reply completes."""

# The tool's result, which tells the model what to do next: without it, a model that wrote its
# answer before handing off writes the whole answer again in the next round.
HANDED_OFF = (
    "Handed off: {name} answers after your reply. Don't repeat what you have already "
    "written; finish in a sentence, or write nothing more."
)

from typing import Any

from mini_me_sidecar.context import CallContext, CoreRequestError
from mini_me_sidecar.tools.base import ToolError


async def hand_off(
    ctx: CallContext, mini_me: str, request: str, file: str | None = None
) -> dict[str, Any]:
    """Hands `request` and the Conversation's file `file` (an Asset ID) to the Mini-Me named
    `mini_me`, one of the call's `mini_mes`; returns `{ handed_to, next }`, where `next` says
    what the model does next. The core decides whether the reply may hand off."""
    target = next((m for m in ctx.mini_mes if m.get("name") == mini_me), None)
    if target is None:
        names = ", ".join(str(m.get("name")) for m in ctx.mini_mes)
        raise ToolError(f"There is no Mini-Me called {mini_me}. Choose one of: {names}.")
    if not request.strip():
        raise ToolError("Say what to ask the other Mini-Me.")
    try:
        await ctx.hand_off(str(target["id"]), request.strip(), file)
    except CoreRequestError as error:
        raise ToolError(f"Not handed off: {error}", error.code) from None
    return {"handed_to": mini_me, "next": HANDED_OFF.format(name=mini_me)}
