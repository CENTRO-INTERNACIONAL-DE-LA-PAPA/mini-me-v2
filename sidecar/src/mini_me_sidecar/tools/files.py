"""Saving files in the Project and reading them back."""

import json
from pathlib import PurePosixPath
from typing import Any

from mini_me_sidecar.context import CallContext, CoreRequestError
from mini_me_sidecar.tools.base import ToolError, find_asset

# The core's limit for a written file.
MAX_FILE_BYTES = 32 * 1024 * 1024

MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024

# The files a model may save, by extension.
TEXT_MEDIA_TYPES = {
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
}

# The most characters of a text file one read returns.
READ_CHARS = 100_000

# The extensions `adapters.data.tables` reads as tables, repeated here so that reading a text
# file does not load pandas.
TABLE_EXTENSIONS = (".csv", ".tsv", ".xlsx")


def check_file(name: str, content: str) -> tuple[str, bytes]:
    """The media type and bytes of a text file a model asks to save."""
    if not name.strip() or "/" in name or "\\" in name:
        raise ToolError("Use a plain file name, such as sample-yields.csv, without folders.")
    media_type = TEXT_MEDIA_TYPES.get(PurePosixPath(name).suffix.lower())
    if media_type is None:
        raise ToolError("Only CSV, TSV, TXT, Markdown and JSON files can be saved.")
    data = content.encode("utf-8")
    if len(data) > MAX_TEXT_FILE_BYTES:
        raise ToolError(f"{name} would be larger than 2 MiB; save a smaller file.")
    if media_type == "application/json":
        try:
            json.loads(content)
        except json.JSONDecodeError as error:
            raise ToolError(f"{name} is not valid JSON: {error}") from None
    return media_type, data


async def save_file(ctx: CallContext, name: str, media_type: str, data: bytes) -> dict[str, Any]:
    """Saves `data` as the Asset `name`, attached to the reply; returns `{ asset_id, name }`."""
    if len(data) > MAX_FILE_BYTES:
        raise ToolError(f"{name} is larger than 32 MiB, so it was not saved.", "file_too_large")
    ctx.progress(f"Saving {name}")
    try:
        asset = await ctx.write_asset(name, media_type, data)
    except CoreRequestError as error:
        hint = " Use a plain file name, without folders." if error.code == "invalid_input" else ""
        raise ToolError(f"{name} was not saved: {error}.{hint}", error.code) from None
    return {"asset_id": asset["id"], "name": asset["name"]}


async def save_text_file(ctx: CallContext, name: str, content: str) -> dict[str, Any]:
    """The form of `save_file` offered to models: a text file, at most 2 MiB."""
    media_type, data = check_file(name, content)
    return await save_file(ctx, name, media_type, data)


async def read_file(ctx: CallContext, asset_id: str, start: int = 0) -> dict[str, Any]:
    """Part of one of the Conversation's files: a table's rows from row `start`, or a text
    file's characters from character `start`, with the totals to read the rest."""
    if start < 0:
        raise ToolError("start cannot be negative.")
    asset = await find_asset(ctx, asset_id)
    name = str(asset.get("name", ""))
    if name.lower().endswith(TABLE_EXTENSIONS):
        # Imported here: the table tools load pandas, which reading a text file never needs.
        from mini_me_sidecar.tools.tables import read_table, table_result

        table = ctx.reads.get(("table", asset_id))
        if table is None:
            table = ctx.reads[("table", asset_id)] = await read_table(ctx, asset_id, name)
        return {"name": name, **table_result(table.frame, start)}
    text = ctx.reads.get(("text", asset_id))
    if text is None:
        ctx.progress(f"Reading {name}")
        data = await ctx.read_asset(asset_id)
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise ToolError(
                f"{name} is not a text file or a table, so it cannot be read.", "unreadable"
            ) from None
        ctx.reads[("text", asset_id)] = text
    return {"name": name, **text_result(text, start)}


def text_result(text: str, start: int) -> dict[str, Any]:
    """Up to `READ_CHARS` characters of `text` from `start`, and whether more follow."""
    part = text[start : start + READ_CHARS]
    return {
        "start": start,
        "total_characters": len(text),
        "more": start + len(part) < len(text),
        "content": part,
    }
