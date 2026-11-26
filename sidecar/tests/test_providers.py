import pytest

from mini_me_sidecar.adapters.providers import provider_error
from mini_me_sidecar.context import Model

MODEL = Model(provider="openrouter", model="some/model")


class StatusError(Exception):
    def __init__(self, status_code: int, text: str):
        super().__init__(text)
        self.status_code = status_code


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

