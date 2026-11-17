import pytest

from mini_me_sidecar.adapters.providers import provider_error
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


def test_custom_errors_name_custom_and_an_unreachable_endpoint():
    custom = Model(
        provider="custom", model="m", endpoint="http://localhost:1234/v1", api_format="openai"
    )
    unreachable = provider_error(Exception("Connection error."), custom)
    assert unreachable.code == "provider_unavailable"
    assert "http://localhost:1234/v1" in str(unreachable)
    rejected = provider_error(StatusError(401, "bad key"), custom)
    assert (rejected.code, str(rejected)) == (
        "provider_auth",
        "Custom rejected the API key. Replace it in Settings.",
    )
