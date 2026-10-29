"""The forms of the tools offered to a model: each tool's name, what the model is told about
it, the JSON Schema of its arguments, and the function that runs it."""

import inspect
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from mini_me_sidecar.context import CallContext
from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.components import read_component
from mini_me_sidecar.tools.documents import edit_document, suggest_edit, write_document
from mini_me_sidecar.tools.files import read_file, save_text_file
from mini_me_sidecar.tools.tables import show_table


@dataclass(frozen=True)
class ModelTool:
    name: str
    description: str
    # JSON Schema of the arguments, as an object whose properties are `run`'s keyword
    # arguments after `ctx`.
    parameters: dict[str, Any]
    run: Callable[..., Awaitable[dict[str, Any]]]

    def schema(self) -> dict[str, Any]:
        """The tool as a function definition for `bind_tools`."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    async def call(self, ctx: CallContext, arguments: dict[str, Any]) -> dict[str, Any]:
        """Runs the tool with the model's `arguments`. Raises `ToolError` when they do not
        fit its parameters; arguments it does not know are left out."""
        known = self.parameters["properties"]
        given = {k: _argument(k, v, known[k]) for k, v in arguments.items() if k in known}
        try:
            inspect.signature(self.run).bind(ctx, **given)
        except TypeError as error:
            raise ToolError(f"Wrong arguments for {self.name}: {error}") from None
        return await self.run(ctx, **given)


def _argument(name: str, value: Any, schema: dict[str, Any]) -> Any:
    """`value` for the parameter `name`. Some providers, such as Google, send every number as
    a float, so a whole float becomes an int where the parameter is an integer."""
    if schema.get("type") == "integer" and isinstance(value, float):
        if not value.is_integer():
            raise ToolError(f"{name} must be a whole number.")
        return int(value)
    return value


CELL = {
    "anyOf": [{"type": "string"}, {"type": "number"}, {"type": "boolean"}, {"type": "null"}]
}

MODEL_TOOLS: dict[str, ModelTool] = {
    tool.name: tool
    for tool in [
        ModelTool(
            name="read_file",
            description=(
                "Reads one of the Conversation's files by its ID. A table (CSV, TSV, Excel) "
                "comes back as its columns and up to 500 rows as CSV; a text file as up to "
                "100,000 characters. When `more` is true, read again from a later `start` "
                "(a row number for tables, a character position for text)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string", "description": "The file's ID."},
                    "start": {
                        "type": "integer",
                        "minimum": 0,
                        "description": "Row or character to start from; 0 by default.",
                    },
                },
                "required": ["asset_id"],
            },
            run=read_file,
        ),
        ModelTool(
            name="read_component",
            description=(
                "Reads one of the Conversation's Interactive Components by its ID: a table's "
                "columns and its rows as CSV, or another component's data as JSON, up to "
                "100,000 characters. A table shown from a file names its `source_asset_id`; "
                "read that file with read_file when you need rows past those the table "
                "holds. When `more` is true, read again from a later `start` (a row number "
                "for tables, a character position for other components)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "component_id": {"type": "string", "description": "The component's ID."},
                    "start": {
                        "type": "integer",
                        "minimum": 0,
                        "description": "Row or character to start from; 0 by default.",
                    },
                },
                "required": ["component_id"],
            },
            run=read_component,
        ),
        ModelTool(
            name="save_file",
            description=(
                "Saves a text file in the Project and attaches it to your reply. The name "
                "must end in .csv, .tsv, .txt, .md or .json; the content is at most 2 MiB. "
                "Returns the new file's ID."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "A plain file name."},
                    "content": {"type": "string", "description": "The whole file's text."},
                },
                "required": ["name", "content"],
            },
            run=save_text_file,
        ),
        ModelTool(
            name="write_document",
            description=(
                "Saves a document the user can open, edit and export as PDF in Mini-Me, and "
                "shows it below your reply. Write the body in Quarto Markdown: headings, "
                "paragraphs, lists, tables and code blocks, without a YAML header; it is at "
                "most 2 MiB. Use it when the user asks for a report or a document. Returns "
                "the new file's ID."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "The document's title."},
                    "body": {"type": "string", "description": "The document's Markdown body."},
                },
                "required": ["title", "body"],
            },
            run=write_document,
        ),
        ModelTool(
            name="suggest_edit",
            description=(
                "Suggests new text for the passage the comment is about, which the user "
                "accepts or rejects in the document; it does not change the document itself. "
                "Give the whole passage as it should read, in the document's Quarto Markdown, "
                "at most 64 KiB; an empty text suggests removing it. Returns the "
                "suggestion's ID."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "The passage as it should read."},
                },
                "required": ["text"],
            },
            run=suggest_edit,
        ),
        ModelTool(
            name="edit_document",
            description=(
                "Suggests edits to a document the user's message references or attaches, which "
                "the user accepts or rejects one by one in the document; it does not change the "
                "document itself. Each edit quotes the exact text it replaces, as read_file "
                "shows it, long enough to occur only once in the document, and gives the new "
                "text in Quarto Markdown (at most 64 KiB; empty removes the passage) and a "
                "one-sentence reason. Send all edits to a document in one call. Returns the "
                "IDs of the suggestions' threads."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "The document's file ID."},
                    "edits": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "find": {
                                    "type": "string",
                                    "description": "The exact text to replace.",
                                },
                                "replace": {"type": "string", "description": "The new text."},
                                "reason": {"type": "string", "description": "Why, briefly."},
                            },
                            "required": ["find", "replace", "reason"],
                        },
                    },
                },
                "required": ["document_id", "edits"],
            },
            run=edit_document,
        ),
        ModelTool(
            name="show_table",
            description=(
                "Shows a table below your reply. Give either `columns` and `rows` (at most "
                "500 rows, one value per column, dates as YYYY-MM-DD) or the `asset_id` of "
                "a CSV, TSV or Excel file of the Conversation."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "columns": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {
                                    "type": "string",
                                    "enum": ["number", "text", "date", "boolean"],
                                },
                            },
                            "required": ["name", "type"],
                        },
                    },
                    "rows": {"type": "array", "items": {"type": "array", "items": CELL}},
                    "asset_id": {"type": "string"},
                },
            },
            run=show_table,
        ),
    ]
}
