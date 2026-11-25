"""Asks the model to fill a catalogue schema from the message and the tables' descriptions."""

import json
import sys
from collections.abc import Iterator
from typing import Any, TypeVar, get_args, get_origin

from pydantic import BaseModel, ValidationError

from mini_me_sidecar.adapters.base import require_model
from mini_me_sidecar.adapters.providers import MAX_LOGGED_CHARS, ask_arguments
from mini_me_sidecar.context import CallContext, TraitError

Plan = TypeVar("Plan", bound=BaseModel)


async def choose(
    ctx: CallContext,
    schema: type[Plan],
    text: str,
    descriptions: list[dict[str, Any]],
    extra: str = "",
) -> tuple[Plan, list[tuple[str, str]]]:
    """The plan, and each malformed entry left out of it as a label and a reason. `extra` is
    more material for the model, after the tables' descriptions."""
    model = require_model(ctx)
    material = (
        f"The user's message:\n{text}\n\nThe tables, described without their rows:\n"
        + json.dumps(descriptions, ensure_ascii=False, indent=1, default=str)
        + (f"\n\n{extra}" if extra else "")
    )
    turns = [("system", ctx.trait.instructions or ""), ("human", material)]
    # Tool calling works with every provider and with OpenRouter's models; the default
    # for OpenAI's client, a `json_schema` response format, is refused by many of them.
    arguments = await ask_arguments(ctx, schema, turns)
    plan, malformed = fit_plan(schema, arguments)
    if plan is None:
        answer = json.dumps(arguments, ensure_ascii=False, default=str)
        print(
            f"[{model.provider}] unusable answer: {answer[:MAX_LOGGED_CHARS]} {malformed}",
            file=sys.stderr,
            flush=True,
        )
        raise TraitError(
            "provider_empty",
            f"{model.model} gave no usable answer. Try again, or choose another model in "
            "Settings.",
        )
    return plan, malformed


def fit_plan(schema: type[Plan], arguments: Any) -> tuple[Plan | None, list[tuple[str, str]]]:
    """`arguments` as a `schema` without its malformed list entries, and those entries' labels
    and reasons; None when nothing usable is left."""
    if not isinstance(arguments, dict):
        return None, []
    kept, malformed = dict(arguments), []
    for name, kinds in _entry_lists(schema):
        entries = arguments.get(name)
        if not isinstance(entries, list):
            continue
        kept[name] = []
        for entry in entries:
            reason = _entry_problem(entry, kinds)
            if reason is None:
                kept[name].append(entry)
            else:
                malformed.append((_entry_label(entry), reason))
        if entries and not kept[name]:
            return None, malformed
    try:
        return schema.model_validate(kept), malformed
    except ValidationError:
        return None, malformed


def _entry_lists(schema: type[BaseModel]) -> Iterator[tuple[str, tuple[type[BaseModel], ...]]]:
    """The fields of `schema` that are lists of models, with the models an entry may be."""
    for name, field in schema.model_fields.items():
        if get_origin(field.annotation) is not list:
            continue
        (entry,) = get_args(field.annotation)
        kinds = get_args(entry) or (entry,)
        if all(isinstance(k, type) and issubclass(k, BaseModel) for k in kinds):
            yield name, kinds


def _entry_problem(entry: Any, kinds: tuple[type[BaseModel], ...]) -> str | None:
    if not isinstance(entry, dict):
        return "not an object"
    kind = entry.get("kind")
    matching = [k for k in kinds if _kind(k) in (None, kind)]
    if not matching:
        return f"no kind `{kind}`" if kind else "no `kind` given"
    try:
        matching[0].model_validate(entry)
    except ValidationError as error:
        first = error.errors()[0]
        where = ".".join(str(part) for part in first["loc"])
        return f"no `{where}` given" if first["type"] == "missing" else f"`{where}`: {first['msg']}"
    return None


def _kind(model: type[BaseModel]) -> str | None:
    """The `kind` literal that tells `model` apart in a union, or None when it has none."""
    field = model.model_fields.get("kind")
    return get_args(field.annotation)[0] if field else None


def _entry_label(entry: Any) -> str:
    if not isinstance(entry, dict):
        return "an entry"
    name = entry.get("kind") or entry.get("template") or "an entry"
    return f'{name} "{entry["title"]}"' if entry.get("title") else str(name)
