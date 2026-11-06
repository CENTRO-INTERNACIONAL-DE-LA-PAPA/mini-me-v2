import asyncio
from typing import Any

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from mini_me_sidecar.context import Model
from mini_me_sidecar.debug import Parts, callbacks, recording

MODEL = Model(provider="anthropic", model="fake")

TOOL_CALL = {"name": "read_table", "args": {"id": "t1"}, "id": "call-1", "type": "tool_call"}


def calls(parts: Parts | None, inputs: list[list[Any]]) -> list[dict[str, Any]]:
    """The entries sent while a fake model answers each of `inputs` in turn."""
    sent: list[dict[str, Any]] = []
    answer = AIMessage(
        "Done", usage_metadata={"input_tokens": 12, "output_tokens": 3, "total_tokens": 15}
    )

    async def run() -> None:
        with recording(parts, sent.append, "Assist", "Assistant"):
            chat = FakeMessagesListChatModel(responses=[answer], callbacks=callbacks(MODEL))
            for messages in inputs:
                await chat.ainvoke(messages)

    asyncio.run(run())
    return sent


def test_a_call_sends_only_the_parts_that_are_on():
    [entry] = calls(Parts(input=False, details=True, tools=False), [[HumanMessage("Hi")]])
    assert entry["type"] == "model_call"
    assert (entry["step"], entry["trait"]) == ("Assist", "Assistant")
    assert (entry["messages"], entry["continues"]) == (None, None)
    assert (entry["provider"], entry["model"]) == ("anthropic", "fake")
    assert (entry["tokens_in"], entry["tokens_out"]) == (12, 3)
    assert isinstance(entry["duration_ms"], int)


def test_a_call_continuing_the_previous_one_sends_only_its_new_messages():
    first = [SystemMessage("Be brief."), HumanMessage("Read the table")]
    second = [
        *first,
        AIMessage("", tool_calls=[TOOL_CALL]),
        ToolMessage('{"rows": 3}', tool_call_id="call-1"),
    ]
    one, two = calls(Parts(input=True, details=False, tools=False), [first, second])
    assert one["messages"] == [
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "Read the table"},
    ]
    assert one["continues"] is None and one["provider"] is None
    assert two["continues"] == one["id"]
    assert [m["role"] for m in two["messages"]] == ["assistant", "tool"]
    assert two["messages"][0]["tool_calls"][0]["name"] == "read_table"
    assert two["messages"][1]["tool_call_id"] == "call-1"


def test_nothing_is_sent_with_every_part_off():
    parts = Parts.from_context({"input": False, "details": False, "tools": False})
    assert parts is None
    assert calls(parts, [[HumanMessage("Hi")]]) == []
