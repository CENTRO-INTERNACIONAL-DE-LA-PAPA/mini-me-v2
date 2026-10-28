import asyncio
from typing import Any

import pytest
from pydantic import ValidationError

from mini_me_sidecar.context import Model, Secret, TraitError
from mini_me_sidecar.workflow.decide import decide, decision_schema


def test_the_schema_allows_only_the_given_choices():
    schema = decision_schema(["testable", "not testable"])
    assert schema(choice="testable").choice == "testable"
    with pytest.raises(ValidationError):
        schema(choice="maybe")


class FakeContext:
    model = Model(provider="openai", model="fake")

    async def secret(self, provider: str) -> Secret:
        return Secret("sk-fake")


def fake_chat(answer: Any) -> Any:
    """A chat model factory whose structured output answers `answer`."""

    class Chat:
        def with_structured_output(self, schema: Any, method: str) -> "Chat":
            self.schema = schema
            return self

        async def ainvoke(self, turns: Any) -> Any:
            return self.schema(choice=answer) if isinstance(answer, str) else answer

    return lambda model, key: Chat()


def ask(answer: Any) -> str:
    return asyncio.run(
        decide(FakeContext(), "Again?", ["repeat", "stop"], "late blight", [], fake_chat(answer))
    )


def test_the_models_choice_is_returned():
    assert ask("stop") == "stop"


def test_an_answer_outside_the_choices_is_an_invalid_decision():
    with pytest.raises(TraitError) as raised:
        ask("perhaps")
    assert raised.value.code == "invalid_decision"
    with pytest.raises(TraitError) as raised:
        ask(None)
    assert raised.value.code == "invalid_decision"
