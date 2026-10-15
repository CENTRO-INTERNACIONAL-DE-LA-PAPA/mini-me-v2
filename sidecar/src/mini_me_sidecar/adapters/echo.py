import asyncio
import re
from typing import Any

from mini_me_sidecar.context import CallContext
from mini_me_sidecar.adapters.base import Adapter, AdapterInfo

CHUNK_DELAY_S = 0.06

# Each chunk is a word with the whitespace after it, so the chunks concatenate back to the
# original text exactly.
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
