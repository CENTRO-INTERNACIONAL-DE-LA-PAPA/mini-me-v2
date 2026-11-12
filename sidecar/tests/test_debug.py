from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage

from mini_me_sidecar.context import Model
from mini_me_sidecar.debug import Parts, Recorder

MODEL = Model(provider="anthropic", model="fake")
ANSWER = AIMessage("Done", usage_metadata={"input_tokens": 12, "output_tokens": 3, "total_tokens": 15})
TOOL_CALL = {"name": "read_table", "args": {"id": "t1"}, "id": "call-1", "type": "tool_call"}


def record(parts: Parts, *calls: list[BaseMessage]) -> tuple[Recorder, list[dict[str, Any]]]:
    sent: list[dict[str, Any]] = []
    recorder = Recorder(parts, sent.append, "Assist", "Assistant")
    for messages in calls:
        recorder.model_call(messages, MODEL, 5, ANSWER)
    return recorder, sent


def test_an_entry_holds_only_the_parts_that_are_on():
    recorder, sent = record(Parts(input=False, details=True, tools=False), [HumanMessage("Hi")])
    [entry] = sent
    assert (entry["step"], entry["trait"]) == ("Assist", "Assistant")
    assert (entry["messages"], entry["continues"]) == (None, None)
    assert (entry["provider"], entry["model"], entry["duration_ms"]) == ("anthropic", "fake", 5)
    assert (entry["tokens_in"], entry["tokens_out"]) == (12, 3)
    recorder.tool_call("read_table", {"id": "t1"}, "{}")
    assert len(sent) == 1
    assert Parts.from_context({"input": False, "details": False, "tools": False}) is None


def test_a_call_continuing_the_previous_one_holds_only_its_new_messages_and_tool_calls():
    first = [SystemMessage("Be brief."), HumanMessage("Read the table")]
    second = [
        *first,
        AIMessage("", tool_calls=[TOOL_CALL]),
        ToolMessage('{"rows": 3}', tool_call_id="call-1"),
    ]
    recorder, sent = record(Parts(input=True, details=False, tools=True), first, second)
    one, two = sent
    assert one["messages"] == [
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "Read the table"},
    ]
    assert one["continues"] is None and one["provider"] is None
    assert two["continues"] == one["id"]
    assert [m["role"] for m in two["messages"]] == ["assistant", "tool"]
    assert two["messages"][0]["tool_calls"][0]["name"] == "read_table"
    assert two["messages"][1]["tool_call_id"] == "call-1"

    recorder.tool_call("read_table", {"id": "t1"}, '{"rows": 3}')
    assert sent[-1] == {
        "type": "tool_call",
        "call": two["id"],
        "name": "read_table",
        "args": {"id": "t1"},
        "result": '{"rows": 3}',
    }
