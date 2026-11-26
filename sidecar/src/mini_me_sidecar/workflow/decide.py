"""What the AI model chosen in Settings decides in a Workflow: a condition's or loop's answer
from a fixed list, and the questions an approval asks."""

import json
from typing import Any, Literal

from pydantic import BaseModel, Field, create_model

from mini_me_sidecar.adapters.providers import ask_structured
from mini_me_sidecar.context import CallContext, TraitError
from mini_me_sidecar.workflow.model import labelled_outputs

SYSTEM = (
    "You decide which path a Mini-Me's Workflow takes next. Read the user's message and the "
    "outputs of the Workflow's earlier Steps, then answer the question with exactly one of "
    "the allowed choices."
)


QUESTIONS_SYSTEM = (
    "You write the questions a Mini-Me's Workflow asks the user before it goes on. Read the "
    "user's message and the outputs of the Workflow's earlier Steps, then write short, plain "
    "questions that do what the instruction asks. Ask only what the message and the outputs "
    "leave open, and don't answer the questions yourself."
)


class Questions(BaseModel):
    questions: str = Field(description="The questions to show the user, as plain text.")


def decision_schema(choices: list[str]) -> type[BaseModel]:
    """A schema whose only field, `choice`, must be one of `choices`."""
    return create_model(
        "Decision",
        choice=(Literal[tuple(choices)], Field(description="One of the allowed choices.")),
    )


async def decide(
    ctx: CallContext,
    question: str,
    choices: list[str],
    message: str,
    earlier: list[dict[str, Any]],
) -> str:
    """The model's answer to `question`, one of `choices`. Raises `invalid_decision` when the
    model answers anything else."""
    allowed = json.dumps(choices, ensure_ascii=False)
    material = _material(message, earlier, f"Question: {question}\nAllowed choices: {allowed}")
    turns = [("system", SYSTEM), ("human", material)]
    # Tool calling works with every provider and with OpenRouter's models.
    answer = await ask_structured(ctx, decision_schema(choices), turns)
    choice = getattr(answer, "choice", None)
    if choice not in choices:
        raise TraitError(
            "invalid_decision",
            "I couldn't work out what to do next from this request. Try again, perhaps "
            "saying it another way.",
        )
    return str(choice)


async def write_questions(
    ctx: CallContext, instruction: str, message: str, earlier: list[dict[str, Any]]
) -> str:
    material = _material(message, earlier, f"Instruction: {instruction}")
    turns = [("system", QUESTIONS_SYSTEM), ("human", material)]
    answer = await ask_structured(ctx, Questions, turns)
    questions = getattr(answer, "questions", "").strip()
    if not questions:
        raise TraitError(
            "questions_failed", "I couldn't write my questions; send your message again."
        )
    return questions


def _material(message: str, earlier: list[dict[str, Any]], ask: str) -> str:
    return "\n\n".join(
        [
            f"The user's message:\n{message}",
            *labelled_outputs(earlier),
            ask,
        ]
    )
