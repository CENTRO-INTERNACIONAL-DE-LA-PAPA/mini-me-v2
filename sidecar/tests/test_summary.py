import asyncio

import pytest

from mini_me_sidecar.adapters.prompt import RESEARCH_CONTEXT
from mini_me_sidecar.context import Model, TraitError
from mini_me_sidecar.summary import (
    MAX_TITLE_CHARS,
    Summarizer,
    _test_model,
    clean_title,
    system_prompt,
)


class FakeLink:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, frame: dict) -> None:
        self.sent.append(frame)


def test_the_summary_prompt_says_whose_research_it_is_and_how_long_to_write():
    prompt = system_prompt()
    assert prompt.startswith(RESEARCH_CONTEXT)
    assert "2 or 3 short sentences, at most 60" in prompt
    assert "never invent" in prompt


def test_a_summary_request_without_an_id_is_ignored():
    link = FakeLink()
    summarizer = Summarizer(link, requests=None)  # type: ignore[arg-type]
    summarizer.start({"type": "summary.start", "material": "x"})
    assert link.sent == []


def test_the_title_prompt_asks_for_a_brief_label_that_is_not_a_copy():
    prompt = system_prompt("title")
    assert prompt.startswith(RESEARCH_CONTEXT)
    assert "brief title" in prompt and "not a sentence" in prompt and "no quotes" in prompt
    assert "do not copy the message" in prompt
    assert "2 or 3 short sentences" not in prompt


def test_a_title_is_the_first_line_without_quotes_or_a_full_stop():
    assert clean_title('"Yield by altitude."\n\nBecause it matters') == "Yield by altitude"
    assert clean_title("  **Late blight trial**  ") == "Late blight trial"
    assert clean_title("   \n  ") == ""
    long = "Breaking the chicken-or-egg riddle into research questions on evolution, definitions"
    cut = clean_title(long)
    assert len(cut) <= MAX_TITLE_CHARS and long.startswith(cut)
    assert cut == "Breaking the chicken-or-egg riddle into research questions"
    assert long[len(cut)] == " "  # cut after a whole word
    assert clean_title("Short title") == "Short title"
    assert len(clean_title("x" * 100)) == MAX_TITLE_CHARS


class ToolChat:
    """A chat model that calls the tool it is forced to use, or answers in text instead."""

    def __init__(self, calls_tool: bool):
        self.calls_tool = calls_tool

    def with_structured_output(self, schema, method):
        chat = self

        class Forced:
            async def ainvoke(self, turns):
                return schema(ok=True) if chat.calls_tool else None

        return Forced()


def test_a_model_that_calls_the_tool_passes_the_model_test():
    model = Model(provider="openai", model="fake")
    assert asyncio.run(_test_model(ToolChat(True), model)) == "ok"


def test_a_model_that_does_not_call_the_tool_fails_the_model_test():
    model = Model(provider="openai", model="fake")
    with pytest.raises(TraitError) as raised:
        asyncio.run(_test_model(ToolChat(False), model))
    assert raised.value.code == "tools_unsupported" and "fake" in str(raised.value)
