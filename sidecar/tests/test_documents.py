import asyncio

import pytest

from mini_me_sidecar.context import CoreRequestError
from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.documents import (
    MAX_SUGGESTION_BYTES,
    document_text,
    file_name,
    suggest,
    write_document,
)


class Call:
    """A call context that records what the tool asks the core for."""

    def __init__(self, document: dict | None = None) -> None:
        self.document = document
        self.written: list[tuple[str, str, bytes]] = []
        self.components: list[tuple[str, int, dict, str]] = []
        self.suggested: list[tuple[str, str, str]] = []

    def progress(self, label: str) -> None:
        pass

    async def write_asset(self, name: str, media_type: str, data: bytes, hidden=False) -> dict:
        self.written.append((name, media_type, data))
        return {"id": "asset-1", "name": name}

    async def component(self, kind: str, version: int, preview: dict, text: str, source) -> str:
        self.components.append((kind, version, preview, text))
        return "component-1"

    async def suggest(self, asset_id: str, find: str, text: str) -> dict:
        if find == "Huancayo":
            raise CoreRequestError("passage_not_unique", "Huancayo occurs 3 times.")
        self.suggested.append((asset_id, find, text))
        return {"suggestion_id": "suggestion-1"}


def test_a_document_has_a_quoted_title_in_its_header():
    text = document_text('Yields "2025"', "# Summary\n\nGood.\n\n")
    assert text == '---\ntitle: "Yields \\"2025\\""\n---\n\n# Summary\n\nGood.\n'


@pytest.mark.parametrize(
    "title, name",
    [
        ("Huancayo 2025 report", "Huancayo 2025 report.qmd"),
        ("Trials: 2026/27", "Trials- 2026-27.qmd"),
        ("CON", "CON_.qmd"),
        ("  ...  ", "Document.qmd"),
    ],
)
def test_a_title_becomes_a_safe_file_name(title, name):
    assert file_name(title) == name


def test_writing_saves_the_file_and_shows_a_card():
    call = Call()
    result = asyncio.run(write_document(call, "Huancayo 2025 report", "# Summary\n"))
    assert result == {"asset_id": "asset-1", "name": "Huancayo 2025 report.qmd"}
    name, media_type, data = call.written[0]
    assert (name, media_type) == ("Huancayo 2025 report.qmd", "text/markdown")
    assert data.decode().startswith('---\ntitle: "Huancayo 2025 report"\n---\n')
    assert call.components == [
        (
            "document",
            1,
            {"asset_id": "asset-1", "title": "Huancayo 2025 report"},
            "Document: Huancayo 2025 report",
        )
    ]


def test_a_document_over_2_mib_is_refused():
    call = Call()
    with pytest.raises(ToolError, match="2 MiB"):
        asyncio.run(write_document(call, "Big", "x" * (2 * 1024 * 1024)))
    assert call.written == []


def test_a_suggestion_goes_to_the_core_within_its_limit_and_reports_a_refusal():
    call = Call()
    result = asyncio.run(suggest(call, "d1", "Yield fell.", "Yield fell sharply."))
    assert result == {"suggestion_id": "suggestion-1"}
    assert call.suggested == [("d1", "Yield fell.", "Yield fell sharply.")]

    with pytest.raises(ToolError):
        asyncio.run(suggest(call, "d1", "Yield fell.", "x" * (MAX_SUGGESTION_BYTES + 1)))
    with pytest.raises(ToolError) as refused:
        asyncio.run(suggest(call, "d1", "Huancayo", "Junín"))
    assert refused.value.code == "passage_not_unique"
    assert len(call.suggested) == 1
