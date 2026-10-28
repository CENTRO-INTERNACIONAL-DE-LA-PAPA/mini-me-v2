import asyncio
import json
from typing import Any

import pytest
from langchain_core.messages import AIMessageChunk, BaseMessage, ToolMessage

from mini_me_sidecar.adapters import prompt
from mini_me_sidecar.adapters.prompt import _converse, _run_tool
from mini_me_sidecar.context import Model, TraitError
from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.model import ModelTool

MODEL = Model(provider="openai", model="fake")


class FakeContext:
    def __init__(self) -> None:
        self.cancelled = asyncio.Event()
        self.written: list[str] = []

    def write(self, text: str) -> None:
        self.written.append(text)


class FakeChat:
    """Answers each round with the next of `rounds`, and keeps the messages it was sent."""

    def __init__(self, rounds: list[AIMessageChunk]) -> None:
        self.rounds = rounds
        self.sent: list[list[BaseMessage]] = []

    async def astream(self, messages: list[BaseMessage]):
        self.sent.append(list(messages))
        yield self.rounds[len(self.sent) - 1]


def tool_call(args: str, text: str = "") -> AIMessageChunk:
    chunk = {"name": "echo", "args": args, "id": "c1", "index": 0}
    return AIMessageChunk(content=text, tool_call_chunks=[chunk])


async def echo(ctx: Any, value: int = 0) -> dict[str, Any]:
    return {"value": value}


async def broken(ctx: Any) -> dict[str, Any]:
    raise RuntimeError("a fault in the tool")


ECHO = ModelTool(
    name="echo",
    description="",
    parameters={"type": "object", "properties": {"value": {"type": "integer"}}},
    run=echo,
)


def converse(chat: FakeChat) -> FakeContext:
    ctx = FakeContext()
    asyncio.run(_converse(ctx, chat, [], MODEL, {"echo": ECHO}))
    return ctx


def test_text_from_separate_rounds_reads_as_separate_paragraphs():
    chat = FakeChat(
        [tool_call("{}", "I read trial.csv first."), AIMessageChunk(content="The trial shows")]
    )
    assert "".join(converse(chat).written) == "I read trial.csv first.\n\nThe trial shows"


def test_a_last_round_with_only_tool_calls_ends_in_an_error(monkeypatch):
    monkeypatch.setattr(prompt, "MAX_TOOL_ROUNDS", 0)
    with pytest.raises(TraitError) as raised:
        converse(FakeChat([tool_call("{}")]))
    assert raised.value.code == "tool_rounds_used"


def test_a_call_with_malformed_arguments_is_reported_to_the_model():
    chat = FakeChat([tool_call("[1, 2]"), AIMessageChunk(content="Answer")])
    converse(chat)
    result = chat.sent[1][-1]
    assert isinstance(result, ToolMessage) and result.tool_call_id == "c1"
    assert "not a JSON object" in result.content


def test_a_whole_float_argument_becomes_an_int():
    assert asyncio.run(ECHO.call(FakeContext(), {"value": 3.0})) == {"value": 3}
    with pytest.raises(ToolError, match="whole number"):
        asyncio.run(ECHO.call(FakeContext(), {"value": 2.5}))


def test_wrong_arguments_and_faults_in_a_tool_are_told_apart():
    needs = ModelTool(
        name="needs",
        description="",
        parameters={"type": "object", "properties": {"value": {"type": "string"}}},
        run=lambda ctx, value: echo(ctx, value),
    )
    fails = ModelTool(
        name="fails", description="", parameters={"type": "object", "properties": {}}, run=broken
    )
    offered = {"needs": needs, "fails": fails}
    wrong = asyncio.run(_run_tool(FakeContext(), offered, {"name": "needs", "args": {}}))
    assert json.loads(wrong)["error"].startswith("Wrong arguments for needs")
    fault = asyncio.run(_run_tool(FakeContext(), offered, {"name": "fails", "args": {}}))
    assert json.loads(fault) == {"error": "fails failed unexpectedly."}


def test_tool_results_beyond_the_budget_are_refused(monkeypatch):
    monkeypatch.setattr(prompt, "MAX_TOOL_RESULT_CHARS", 10)
    chat = FakeChat([tool_call("{}"), AIMessageChunk(content="Answer")])
    converse(chat)
    result = chat.sent[1][-1]
    assert isinstance(result, ToolMessage)
    assert "left for tool results" in result.content
