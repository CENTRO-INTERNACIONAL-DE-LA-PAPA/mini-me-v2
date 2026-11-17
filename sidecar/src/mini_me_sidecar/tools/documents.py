"""Writes Quarto Markdown (`.qmd`) documents and suggests changes to them."""

import json
import re
from typing import Any

from mini_me_sidecar.context import CallContext, CoreRequestError
from mini_me_sidecar.tools.base import ToolError, add_component
from mini_me_sidecar.tools.files import MAX_TEXT_FILE_BYTES, save_file

MEDIA_TYPE = "text/markdown"

# The most UTF-8 bytes of the text a suggestion puts in place of a passage.
MAX_SUGGESTION_BYTES = 64 * 1024

# The same names `projects::folder_name` in the Rust core refuses on Windows.
_WINDOWS_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{n}" for n in range(1, 10)),
    *(f"LPT{n}" for n in range(1, 10)),
}  # fmt: skip


def file_name(title: str) -> str:
    """`title` made safe on every file system, as the core names documents, plus `.qmd`."""
    stem = re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]', "-", title).strip().rstrip(". ")
    stem = stem or "Document"
    if stem.split(".")[0].upper() in _WINDOWS_RESERVED:
        stem += "_"
    return f"{stem}.qmd"


def document_text(title: str, body: str) -> str:
    """A Quarto document: a YAML header holding `title`, then `body`. The title is written as a
    JSON string, which YAML reads as a quoted string, so any title is safe."""
    return f"---\ntitle: {json.dumps(title, ensure_ascii=False)}\n---\n\n{body.strip()}\n"


async def write_document(ctx: CallContext, title: str, body: str) -> dict[str, Any]:
    """Saves a new document with a card below the reply; returns `{ asset_id, name }`."""
    title = title.strip()
    if not title:
        raise ToolError("A document needs a title.")
    data = document_text(title, body).encode("utf-8")
    if len(data) > MAX_TEXT_FILE_BYTES:
        raise ToolError(f"{title} would be larger than 2 MiB; write a shorter document.")
    saved = await save_file(ctx, file_name(title), MEDIA_TYPE, data)
    preview = {"asset_id": saved["asset_id"], "title": title}
    await add_component(ctx, "document", preview, f"Document: {title}", None)
    return saved


async def suggest(ctx: CallContext, document_id: str, find: str, text: str) -> dict[str, Any]:
    """Suggests replacing the passage `find` of a document with `text`, to accept or discard in the
    document; returns `{ suggestion_id }`."""
    if len(text.encode("utf-8")) > MAX_SUGGESTION_BYTES:
        raise ToolError("A suggestion can be at most 64 KiB; suggest a shorter passage.")
    try:
        return await ctx.suggest(document_id, find, text)
    except CoreRequestError as error:
        raise ToolError(f"Nothing was suggested: {error}", error.code) from None
