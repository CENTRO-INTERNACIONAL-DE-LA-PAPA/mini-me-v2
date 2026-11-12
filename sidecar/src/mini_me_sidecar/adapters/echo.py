import asyncio
import re
from typing import Any

from mini_me_sidecar.context import CallContext
from mini_me_sidecar.adapters.base import Adapter, AdapterInfo

CHUNK_DELAY_S = 0.06

# A word and the whitespace after it, so the chunks join back into the exact text.
CHUNKS = re.compile(r"\S*\s+|\S+")


class Echo(Adapter):
    info = AdapterInfo(
        id="echo",
        description="Streams your message back to you, one word at a time.",
        input_schema={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        for chunk in CHUNKS.findall(str(input.get("text", ""))):
            await asyncio.sleep(CHUNK_DELAY_S)
            if ctx.cancelled.is_set():
                return
            ctx.write(chunk)
