import io

import pandas as pd
import pytest

from mini_me_sidecar.adapters.data.tables import parse_table, table_assets, table_file
from mini_me_sidecar.context import TraitError


def test_semicolon_csv_in_latin_1():
    data = "plot;variedad;fecha\n1;Canchán;2024-05-01\n2;Yungay;2024-05-02\n".encode("latin-1")
    table = parse_table("trial.csv", data)
    assert table.delimiter == ";"
    assert list(table.frame["variedad"]) == ["Canchán", "Yungay"]
    assert pd.api.types.is_datetime64_any_dtype(table.frame["fecha"])


def test_excel_sheet_named_in_the_message():
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame({"a": [1]}).to_excel(writer, sheet_name="2024", index=False)
        pd.DataFrame({"b": [2]}).to_excel(writer, sheet_name="2025", index=False)
    assert parse_table("h.xlsx", buffer.getvalue(), "use 2025").sheet == "2025"
    first = parse_table("h.xlsx", buffer.getvalue(), "")
    assert (first.sheet, first.sheets) == ("2024", ["2024", "2025"])


def test_only_tables_are_read_references_first():
    message = {
        "attachments": [{"id": "a", "name": "notes.txt"}, {"id": "b", "name": "plots.csv"}],
        "text_components": [{"kind": "asset", "id": "c", "label": "#harvest.xlsx"}],
    }
    assert table_assets(message) == [("c", "harvest.xlsx"), ("b", "plots.csv")]


def test_unparseable_file_names_it():
    with pytest.raises(TraitError, match="bad.xlsx"):
        parse_table("bad.xlsx", b"not a workbook")


def test_written_csv_keeps_delimiter_and_plain_dates():
    table = parse_table("t.csv", b"a;d\n1;2024-05-01\n")
    name, media, data = table_file(table, table.frame, "cleaned")
    assert (name, media) == ("t-cleaned.csv", "text/csv")
    assert data.decode() == "a;d\n1;2024-05-01\n"
