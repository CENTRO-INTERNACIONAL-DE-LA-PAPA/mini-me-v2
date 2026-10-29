"""Writing documents: Quarto Markdown (`.qmd`) files the user opens and edits in the app's
document view, and suggesting edits to them, to a thread's passage or from a Conversation."""

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
    """The document's file name: `title` with the characters no file system allows replaced,
    as the core names documents, and the `.qmd` extension."""
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
    """Saves a new document and shows a card for it below the reply; returns
    `{ asset_id, name }`."""
    title = title.strip()
    if not title:
        raise ToolError("A document needs a title.")
    data = document_text(title, body).encode("utf-8")
    if len(data) > MAX_TEXT_FILE_BYTES:
        raise ToolError(f"{title} would be larger than 2 MiB; write a shorter document.")
    saved = await save_file(ctx, file_name(title), MEDIA_TYPE, data)
    await add_component(
        ctx, "document", {"asset_id": saved["asset_id"], "title": title}, f"Document: {title}"
    )
    return saved


async def suggest_edit(ctx: CallContext, text: str) -> dict[str, Any]:
    """Suggests `text` in place of the passage of the comment thread the call answers, for the
    user to accept or reject; returns `{ component_id }`. The document itself is unchanged."""
    if ctx.document is None:
        raise ToolError("Edits can only be suggested in a comment thread.", "not_in_thread")
    if len(text.encode("utf-8")) > MAX_SUGGESTION_BYTES:
        raise ToolError("A suggestion can be at most 64 KiB; suggest a shorter passage.")
    shown = text if text.strip() else "Remove this passage."
    component_id = await add_component(ctx, "suggestion", {"text": text}, shown)
    return {"component_id": component_id}


async def edit_document(
    ctx: CallContext, document_id: str, edits: list[dict[str, Any]]
) -> dict[str, Any]:
    """Suggests `edits`, each `{ find, replace, reason }`, to the document `document_id`, for the
    user to accept or reject in the document view; returns `{ component_id, threads }`. The
    document itself is unchanged."""
    if ctx.document is not None:
        raise ToolError("In a comment thread, suggest an edit to its passage instead.", "in_thread")
    cleaned = []
    for number, edit in enumerate(edits, start=1):
        find, replace, reason = (str(edit.get(key, "")) for key in ("find", "replace", "reason"))
        if len(replace.encode("utf-8")) > MAX_SUGGESTION_BYTES:
            raise ToolError(f"Edit {number}'s new text is larger than 64 KiB; split it up.")
        cleaned.append({"find": find, "replace": replace, "reason": reason})
    try:
        return await ctx.edit_document(document_id, cleaned)
    except CoreRequestError as error:
        raise ToolError(f"No edit was suggested: {error}", error.code) from None
