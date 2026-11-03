import asyncio

import pytest
from pydantic import BaseModel

from mini_me_sidecar.adapters.providers import provider_error, structured_answer
from mini_me_sidecar.context import Model

MODEL = Model(provider="openrouter", model="some/model")


class StatusError(Exception):
    def __init__(self, status_code: int, text: str):
        super().__init__(text)
        self.status_code = status_code


def test_a_model_without_tool_calling_gets_its_own_error_even_on_a_404():
    error = provider_error(StatusError(404, "No endpoints found that support tool use"), MODEL)
    assert error.code == "tools_unsupported"
    assert "some/model" in str(error)


def test_a_model_that_refuses_a_forced_tool_call_gets_a_tools_error():
    text = 'tool_choice: type "tool" and "any" are not supported for this model.'
    error = provider_error(StatusError(400, text), MODEL)
    assert error.code == "tools_unsupported"
    assert "some/model" in str(error)


def test_a_request_longer_than_the_context_says_so():
    text = "This model's maximum context length is 8192 tokens"
    assert provider_error(StatusError(400, text), MODEL).code == "provider_context"
    assert provider_error(StatusError(400, "prompt is too long"), MODEL).code == "provider_context"


def test_other_failures_keep_their_status_message():
    assert provider_error(StatusError(404, "gone"), MODEL).code == "provider_model"
    assert provider_error(StatusError(500, "boom"), MODEL).code == "provider_unavailable"


@pytest.mark.parametrize(
    "text",
    [
        "No endpoints found that support tool use, key sk-secret123",
        "maximum context length exceeded for key sk-secret123",
        "Incorrect API key provided: sk-secret123",
        "boom sk-secret123",
    ],
)
def test_no_message_carries_provider_text(text):
    assert "sk-secret123" not in str(provider_error(StatusError(400, text), MODEL))


class Pick(BaseModel):
    choice: str


class Reply:
    def __init__(self, calls):
        self.tool_calls = calls


class Chat:
    """A chat model that refuses a forced tool choice and answers with `calls` when offered one."""

    def __init__(self, calls, refuse=True):
        self.calls = calls
        self.refuse = refuse
        self.bound = None

    def with_structured_output(self, schema, method):
        chat = self

        class Forced:
            async def ainvoke(self, turns):
                if chat.refuse:
                    raise StatusError(400, 'tool_choice: type "tool" is not supported')
                return schema(choice="forced")

        return Forced()

    def bind_tools(self, tools, tool_choice):
        self.bound = (tools, tool_choice)
        chat = self

        class Bound:
            async def ainvoke(self, turns):
                return Reply(chat.calls)

        return Bound()


def answer(chat):
    return asyncio.run(structured_answer(chat, Pick, []))


def test_a_model_that_refuses_a_forced_tool_is_offered_the_tool_instead():
    chat = Chat([{"name": "Pick", "args": {"choice": "stop"}}])
    assert answer(chat) == Pick(choice="stop")
    assert chat.bound == ([Pick], "auto")


def test_a_model_that_calls_no_tool_or_a_wrong_one_gives_no_answer():
    assert answer(Chat([])) is None
    assert answer(Chat([{"name": "Pick", "args": {"wrong": 1}}])) is None


def test_a_model_that_accepts_a_forced_tool_is_not_offered_it_again():
    chat = Chat([], refuse=False)
    assert answer(chat) == Pick(choice="forced")
    assert chat.bound is None


def test_other_errors_are_not_retried():
    class Failing(Chat):
        def with_structured_output(self, schema, method):
            class Forced:
                async def ainvoke(self, turns):
                    raise StatusError(500, "boom")

            return Forced()

    with pytest.raises(StatusError):
        answer(Failing([]))
