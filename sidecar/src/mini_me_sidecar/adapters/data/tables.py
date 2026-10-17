"""Reads the tables a data Trait works on: the CSV, TSV and Excel Assets a message references
with `#` or attaches, parsed into pandas DataFrames."""

import csv
import io
import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

import pandas as pd

from mini_me_sidecar.context import CallContext, TraitError

TABLE_EXTENSIONS = (".csv", ".tsv", ".xlsx")

MAX_TABLE_BYTES = 100 * 1024 * 1024

# A text column is a date column when this share of its values look like dates.
DATE_SHARE = 0.9

DATE_LIKE = re.compile(r"^\s*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?\s*$")

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

NO_TABLE = "Reference a CSV, TSV or Excel (.xlsx) file with # or attach one."


@dataclass
class Table:
    name: str
    frame: pd.DataFrame
    # For a CSV or TSV, the delimiter it was read with; written files keep it.
    delimiter: str | None = None
    # For an Excel file, the sheet read and every sheet it has.
    sheet: str | None = None
    sheets: list[str] = field(default_factory=list)

    @property
    def stem(self) -> str:
        return PurePosixPath(self.name).stem

    @property
    def extension(self) -> str:
        return PurePosixPath(self.name).suffix.lower()


def table_assets(message: dict[str, Any]) -> list[tuple[str, str]]:
    """The `(asset_id, name)` of each table the message references, then of each it attaches,
    without repeats."""
    assets: dict[str, str] = {}
    for component in message.get("text_components") or []:
        if component.get("kind") == "asset":
            label = str(component.get("label", "")).removeprefix("#")
            assets.setdefault(str(component.get("id")), label)
    for attachment in message.get("attachments") or []:
        assets.setdefault(str(attachment.get("id")), str(attachment.get("name", "")))
    return [(i, name) for i, name in assets.items() if name.lower().endswith(TABLE_EXTENSIONS)]


async def read_tables(ctx: CallContext, text: str) -> list[Table]:
    """Every table the call's message points to, in order. Fails when there is none."""
    tables = []
    for asset_id, name in table_assets(ctx.message):
        data = await ctx.read_asset(asset_id)
        if len(data) > MAX_TABLE_BYTES:
            raise TraitError(
                "table_too_large", f"{name} is larger than 100 MiB, the limit for data files."
            )
        tables.append(parse_table(name, data, text))
    if not tables:
        raise TraitError("no_table", NO_TABLE)
    return tables


def parse_table(name: str, data: bytes, text: str = "") -> Table:
    """Parses one file by its extension. For Excel, reads the sheet whose name appears in
    `text`, else the first."""
    try:
        if name.lower().endswith(".xlsx"):
            book = pd.ExcelFile(io.BytesIO(data), engine="openpyxl")
            sheets = [str(s) for s in book.sheet_names]
            sheet = next((s for s in sheets if s in text), sheets[0])
            frame = book.parse(sheet)
            return Table(name, _typed(frame), sheet=sheet, sheets=sheets)
        content = _decode(data)
        delimiter = "\t" if name.lower().endswith(".tsv") else _delimiter(content)
        frame = pd.read_csv(io.StringIO(content), sep=delimiter)
        return Table(name, _typed(frame), delimiter=delimiter)
    except TraitError:
        raise
    except Exception as error:
        reason = str(error).splitlines()[0] if str(error) else type(error).__name__
        raise TraitError("table_unreadable", f"Could not read {name} as a table: {reason}")


def column_type(series: pd.Series) -> str:
    """`number`, `text`, `date` or `boolean`, as the table component and the model see it."""
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    return "text"


def as_text(series: pd.Series) -> pd.Series:
    """Values as text the way a user writes them: `999`, not `999.0`; missing stays missing."""

    def text(value: object) -> object:
        if pd.isna(value):
            return value
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)

    return series.map(text)


def table_file(
    table: Table, frame: pd.DataFrame, suffix: str, csv_only: bool = False
) -> tuple[str, str, bytes]:
    """`frame` as a file named after `table` plus `suffix`, in `table`'s format (or CSV):
    the name, media type and bytes."""
    extension = ".csv" if csv_only else table.extension
    name = f"{table.stem}-{suffix}{extension}"
    if extension == ".xlsx":
        buffer = io.BytesIO()
        frame.to_excel(buffer, sheet_name=table.sheet or "Sheet1", index=False, engine="openpyxl")
        return name, XLSX, buffer.getvalue()
    delimiter = "\t" if extension == ".tsv" else (table.delimiter if not csv_only else None) or ","
    dates = [c for c in frame.columns if pd.api.types.is_datetime64_any_dtype(frame[c])]
    # Dates without a time of day are written as dates, not as midnight timestamps.
    date_only = all((frame[c].dropna() == frame[c].dropna().dt.normalize()).all() for c in dates)
    text = frame.to_csv(sep=delimiter, index=False, date_format="%Y-%m-%d" if date_only else None)
    media = "text/tab-separated-values" if extension == ".tsv" else "text/csv"
    return name, media, text.encode("utf-8")


def plain_value(value: Any) -> Any:
    """A numpy or pandas scalar as a plain Python value; dates as ISO text, without a time of
    day when they have none."""
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat() if value == value.normalize() else value.isoformat()
    return value.item() if hasattr(value, "item") else value


def _typed(frame: pd.DataFrame) -> pd.DataFrame:
    """Turns text columns that hold dates into datetime columns."""
    for name in frame.columns:
        column = frame[name]
        if column_type(column) != "text":
            continue
        values = column.dropna().astype(str)
        if len(values) and values.str.match(DATE_LIKE).mean() >= DATE_SHARE:
            frame[name] = pd.to_datetime(column, errors="coerce", format="mixed")
    return frame


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("latin-1")


def _delimiter(content: str) -> str:
    """`,` or `;`, whichever the start of the file uses."""
    try:
        return csv.Sniffer().sniff(content[:65536], delimiters=",;").delimiter
    except csv.Error:
        return ","
