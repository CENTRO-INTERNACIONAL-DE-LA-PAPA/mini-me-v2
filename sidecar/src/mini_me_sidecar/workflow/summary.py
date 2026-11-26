"""The summary that ends a multi-Step Workflow's reply, written by the AI model chosen in
Settings from the user's message and the Steps' outputs."""

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from mini_me_sidecar.adapters.base import require_model
from mini_me_sidecar.adapters.providers import chat_model, provider_error
from mini_me_sidecar.context import CallContext, TraitError
from mini_me_sidecar.workflow.model import labelled_outputs

SYSTEM = (
    "You write the end of a Mini-Me's reply: a short summary of what its Workflow's Steps found "
    "for the user's message. Use only what the Steps' outputs say, keep their numbers as "
    "written, and say which Step each finding comes from when it helps. Write a few short "
    "paragraphs or a short list, with no title."
)


async def summarize(ctx: CallContext, message: str, earlier: list[dict[str, Any]]) -> None:
    model = require_model(ctx)
    key = await ctx.secret(model.provider)
    material = "\n\n".join(
        [f"The user's message:\n{message}", "The Steps' outputs:", *labelled_outputs(earlier)]
    )
    chat = chat_model(model, key.reveal())
    try:
        async for chunk in chat.astream([SystemMessage(SYSTEM), HumanMessage(material)]):
            if ctx.cancelled.is_set():
                return
            ctx.write(str(chunk.text))
    except TraitError:
        raise
    except Exception as error:
        raise provider_error(error, model) from None
