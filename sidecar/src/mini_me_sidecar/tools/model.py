"""The forms of the tools offered to a model: each tool's name, what the model is told about
it, the JSON Schema of its arguments, and the function that runs it."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from mini_me_sidecar.context import CallContext
from mini_me_sidecar.tools.components import read_component
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
        known = self.parameters["properties"]
        return await self.run(ctx, **{k: v for k, v in arguments.items() if k in known})


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
                "columns and all its rows as CSV, or another component's data."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "component_id": {"type": "string", "description": "The component's ID."},
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
