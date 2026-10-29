import asyncio
import base64

import pytest

from mini_me_sidecar import documents as module
from mini_me_sidecar.adapters.prompt import RESEARCH_CONTEXT
from mini_me_sidecar.documents import Documents, draft_prompt


class FakeLink:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, frame: dict) -> None:
        self.sent.append(frame)


class FakeRequests:
    async def send(self, call_id: str, method: str, params: dict) -> dict:
        assert (call_id, method, params) == ("d1", "secret.get", {"provider": "openai"})
        return {"value": "sk-test"}


class Chunk:
    def __init__(self, text: str) -> None:
        self.text = text
        self.response_metadata: dict = {}


class FakeChat:
    """A model that sends `pieces`, waiting `pause` seconds before each."""

    def __init__(self, pieces: list[str], pause: float = 0) -> None:
        self.pieces = pieces
        self.pause = pause
        self.messages: list = []

    async def astream(self, messages):
        self.messages = messages
        for piece in self.pieces:
            await asyncio.sleep(self.pause)
            yield Chunk(piece)


START = {
    "type": "draft.start",
    "draft_id": "d1",
    "model": {"provider": "openai", "model": "gpt-x"},
    "title": "Trial design",
    "material": "You: plot yield\nPlotter: Yield falls above 3,800 m.",
}


def run_draft(chat: FakeChat, monkeypatch, cancel_after: float | None = None) -> list[dict]:
    monkeypatch.setattr(module, "chat_model", lambda model, key: chat)
    link = FakeLink()

    async def main() -> None:
        documents = Documents(link, FakeRequests())  # type: ignore[arg-type]
        documents.start_draft(START)
        if cancel_after is not None:
            if cancel_after:
                await asyncio.sleep(cancel_after)
            documents.cancel_draft("d1")

        async def ended() -> None:
            while not any(f["type"] in ("draft.done", "draft.error") for f in link.sent):
                await asyncio.sleep(0.01)

        await asyncio.wait_for(ended(), timeout=2)

    asyncio.run(main())
    return link.sent


def test_the_draft_prompt_says_whose_research_it_is_and_what_to_write():
    prompt = draft_prompt()
    assert prompt.startswith(RESEARCH_CONTEXT)
    assert "'# Summary'" in prompt and "YAML header" in prompt and "never invent" in prompt


def test_a_draft_streams_its_text_then_ends(monkeypatch):
    chat = FakeChat(["# Summary\n", "Yield falls."])
    sent = run_draft(chat, monkeypatch)
    assert [f["type"] for f in sent] == ["draft.delta", "draft.delta", "draft.done"]
    assert "".join(f.get("text", "") for f in sent) == "# Summary\nYield falls."
    assert chat.messages[1].content.startswith("Title: Trial design\n\nYou: plot yield")


def test_a_cancelled_draft_ends_as_done(monkeypatch):
    chat = FakeChat(["one ", "two ", "three"], pause=0.05)
    sent = run_draft(chat, monkeypatch, cancel_after=0.08)
    assert sent[-1] == {"type": "draft.done", "draft_id": "d1"}
    assert "three" not in "".join(f.get("text", "") for f in sent)


def test_a_draft_cancelled_before_it_starts_ends_as_done(monkeypatch):
    sent = run_draft(FakeChat(["one"]), monkeypatch, cancel_after=0)
    assert sent == [{"type": "draft.done", "draft_id": "d1"}]


def test_an_empty_draft_is_an_error(monkeypatch):
    sent = run_draft(FakeChat([]), monkeypatch)
    assert sent[-1]["type"] == "draft.error"
    assert sent[-1]["error"]["code"] == "provider_empty"


def test_an_export_answers_with_the_pdf():
    link = FakeLink()

    async def main() -> None:
        documents = Documents(link, None)  # type: ignore[arg-type]
        documents.start_export({"type": "document.export", "export_id": "e1", "source": "# A"})
        while not link.sent:
            await asyncio.sleep(0.01)

    asyncio.run(main())
    assert link.sent[0]["type"] == "document.exported"
    assert base64.b64decode(link.sent[0]["data"]).startswith(b"%PDF")


def test_a_preview_answers_with_one_svg_per_page():
    link = FakeLink()
    source = "# A\n\n" + "\n\n".join(["Text " * 400] * 6)

    async def main() -> None:
        documents = Documents(link, None)  # type: ignore[arg-type]
        documents.start_preview({"type": "document.preview", "preview_id": "p1", "source": source})
        while not link.sent:
            await asyncio.sleep(0.01)

    asyncio.run(main())
    frame = link.sent[0]
    assert frame["type"] == "document.previewed" and frame["preview_id"] == "p1"
    assert len(frame["pages"]) > 1
    assert all(page.startswith("<svg") for page in frame["pages"])


@pytest.mark.parametrize(
    "frame", [{"type": "draft.start"}, {"type": "document.export"}, {"type": "document.preview"}]
)
def test_requests_without_an_id_are_ignored(frame):
    link = FakeLink()
    documents = Documents(link, None)  # type: ignore[arg-type]
    start = {
        "draft.start": documents.start_draft,
        "document.export": documents.start_export,
        "document.preview": documents.start_preview,
    }[frame["type"]]
    start(frame)
    assert link.sent == []
