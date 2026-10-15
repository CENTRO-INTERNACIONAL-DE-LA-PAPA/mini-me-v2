"""Runs prompt-based Traits: the Trait's instructions as the system prompt, the message and
the text Assets it references as the user prompt, streamed from the provider chosen in
Settings."""

import re
import sys
from typing import Any, AsyncIterator

from mini_me_sidecar.adapters.base import Adapter, AdapterInfo
from mini_me_sidecar.context import CallContext, Model, TraitError

PROVIDER_NAMES = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "openrouter": "OpenRouter",
}

OPENROUTER_URL = "https://openrouter.ai/api/v1"

MAX_MATERIAL_CHARS = 400_000

HTTP_STATUS = re.compile(r"\b([45]\d\d)\b")

# Anthropic requires an output limit; this leaves room for long summaries.
ANTHROPIC_MAX_TOKENS = 4096

# How many times to ask before giving up on a model that answers with no text at all.
EMPTY_ANSWER_TRIES = 2

# Finish reasons with which a provider's safety filter declines to answer; asking again gets
# the same verdict.
REFUSED = {"content_filter", "refusal"}


class Prompt(Adapter):
    info = AdapterInfo(
        id="prompt",
        description="Answers with an AI model, following the Trait's instructions.",
        input_schema={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        model = ctx.model
        if model is None or not model.model:
            raise TraitError("model_not_set", "Choose an AI model in Settings first.")
        if model.provider not in PROVIDER_NAMES:
            raise TraitError("provider_unavailable", f"Unknown provider {model.provider!r}.")

        material, unreadable = await _material(ctx, str(input.get("text", "")))
        if len(material) > MAX_MATERIAL_CHARS:
            raise TraitError(
                "input_too_large",
                f"This is {len(material):,} characters; the limit is {MAX_MATERIAL_CHARS:,}. "
                "Reference fewer or smaller files.",
            )
        earlier = await _earlier_turns(ctx) if ctx.needs_context is not False else []
        key = await ctx.secret(model.provider)
        instructions = ctx.trait.instructions or ""
        if ctx.mini_me_name:
            instructions = f"You are {ctx.mini_me_name}, a Mini-Me.\n\n{instructions}"
        turns = [("system", instructions), *earlier, ("human", material)]

        name = PROVIDER_NAMES[model.provider]
        for _ in range(EMPTY_ANSWER_TRIES):
            wrote = False
            ending: dict[str, Any] = {}
            try:
                async for text, metadata in _stream(model, key.reveal(), _merged(turns)):
                    if ctx.cancelled.is_set():
                        return
                    if text:
                        ctx.write(text)
                        wrote = True
                    ending.update(metadata)
            except TraitError:
                raise
            except Exception as error:
                raise _provider_error(error, model) from None
            if wrote:
                break
            # A provider can end a stream with no text and no error, for example when it
            # reports a failure only through the finish reason.
            print(f"[prompt] {name} sent an empty answer: {ending}", file=sys.stderr, flush=True)
            if ending.get("finish_reason") in REFUSED or ending.get("stop_reason") in REFUSED:
                raise TraitError(
                    "provider_refused",
                    f"{model.model} declined to answer: {name}'s content filter stopped it. "
                    "Rephrase it, ask in a new Conversation, or choose another model in "
                    "Settings.",
                )
        else:
            raise TraitError(
                "provider_empty",
                f"{name} sent an empty answer twice. Try again, or choose another model in "
                "Settings.",
            )

        if unreadable:
            names = ", ".join(unreadable)
            ctx.write(f"\n\n_Could not read {names}: only text files are supported for now._")


async def _material(ctx: CallContext, text: str) -> tuple[str, list[str]]:
    """The user prompt: `text` followed by each referenced or attached text Asset, and the
    names of the Assets that are not UTF-8 text."""
    assets: dict[str, str] = {}
    for attachment in ctx.message.get("attachments") or []:
        assets.setdefault(str(attachment.get("id")), str(attachment.get("name", "")))
    for component in ctx.message.get("text_components") or []:
        if component.get("kind") == "asset":
            label = str(component.get("label", "")).removeprefix("#")
            assets.setdefault(str(component.get("id")), label)

    parts = [text]
    unreadable: list[str] = []
    for asset_id, name in assets.items():
        data = await ctx.read_asset(asset_id)
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            unreadable.append(name)
            continue
        parts.append(f"--- {name} ---\n{content}")
    return "\n\n".join(p for p in parts if p), unreadable


async def _earlier_turns(ctx: CallContext) -> list[tuple[str, str]]:
    """The Conversation's earlier messages as chat turns. Only the calling Mini-Me's replies
    are assistant turns; other Mini-Mes' replies are quoted on the user's side, because models
    copy any name prefix they see on their own earlier turns."""
    history = await ctx.history()
    turns: list[tuple[str, str]] = []
    for entry in history.get("messages") or []:
        content = str(entry.get("content", ""))
        files = entry.get("files") or []
        if files:
            content += f"\n(files: {', '.join(files)})"
        if entry.get("author") == "user":
            turns.append(("human", content))
            continue
        if not entry.get("complete", True):
            content += " [stopped before finishing]"
        name = entry.get("name")
        if name == ctx.mini_me_name:
            turns.append(("ai", content))
        else:
            turns.append(("human", f"{name} replied:\n{content}"))
    # Saying that older messages were cut also keeps the chat from opening with an assistant
    # turn, which some providers reject.
    if history.get("truncated") or (turns and turns[0][0] == "ai"):
        turns.insert(0, ("human", "(earlier messages were left out)"))
    return turns


def _merged(turns: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """`turns` with consecutive turns of the same role joined, since Anthropic and Google
    expect user and assistant turns to alternate."""
    merged: list[tuple[str, str]] = []
    for role, content in turns:
        if merged and merged[-1][0] == role and role != "system":
            merged[-1] = (role, f"{merged[-1][1]}\n\n{content}")
        else:
            merged.append((role, content))
    return merged


# Chunk metadata worth logging when an answer is empty; none of it holds the key or text.
ENDING_FIELDS = ("finish_reason", "stop_reason", "model_name", "error")


async def _stream(
    model: Model, key: str, turns: list[tuple[str, str]]
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """The model's answer, chunk by chunk, with each chunk's finish reason, model name and
    token counts when the provider sends them."""
    chat = _chat_model(model, key)
    async for chunk in chat.astream(turns):
        metadata = getattr(chunk, "response_metadata", None) or {}
        ending = {k: metadata[k] for k in ENDING_FIELDS if metadata.get(k) is not None}
        if usage := getattr(chunk, "usage_metadata", None):
            ending["usage"] = dict(usage)
        # `text` joins the chunk's text blocks, whatever shape the provider sends them in.
        yield str(chunk.text), ending


def _chat_model(model: Model, key: str) -> Any:
    """The LangChain chat model for `model`. Integrations are imported here so the sidecar
    starts quickly and calls that never use a provider never load its package."""
    match model.provider:
        case "openai" | "openrouter":
            from langchain_openai import ChatOpenAI

            base_url = OPENROUTER_URL if model.provider == "openrouter" else None
            return ChatOpenAI(model=model.model, api_key=key, base_url=base_url)
        case "anthropic":
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(model=model.model, api_key=key, max_tokens=ANTHROPIC_MAX_TOKENS)
        case "google":
            from langchain_google_genai import ChatGoogleGenerativeAI

            return ChatGoogleGenerativeAI(model=model.model, google_api_key=key)
    raise TraitError("provider_unavailable", f"Unknown provider {model.provider!r}.")


def _provider_error(error: Exception, model: Model) -> TraitError:
    """Maps any SDK's exception to an error the user can act on. Provider messages are never
    passed on: some echo part of the API key."""
    name = PROVIDER_NAMES[model.provider]
    # `status_code` on OpenAI and Anthropic errors, `code` on Google ones; integrations that
    # wrap the SDK's error keep the status only in the text.
    status = getattr(error, "status_code", None)
    if not isinstance(status, int):
        code = getattr(error, "code", None)
        status = code if isinstance(code, int) else None
    if status is None and (found := HTTP_STATUS.search(str(error))):
        status = int(found.group(1))

    # Google answers an invalid key with 400 rather than 401.
    if status in (401, 403) or (status == 400 and "api key" in str(error).lower()):
        return TraitError(
            "provider_auth",
            f"{name} rejected the API key. Replace it in Settings.",
        )
    if status == 404:
        return TraitError(
            "provider_model",
            f"{name} has no model called {model.model!r}. Check the model in Settings.",
        )
    if status in (402, 429):
        return TraitError(
            "provider_rate_limit",
            f"{name} is limiting requests or the account is out of credit. "
            "Try again later or check your account.",
        )
    if status is None:
        return TraitError(
            "provider_unavailable",
            f"Could not reach {name}. Check your internet connection and try again.",
        )
    return TraitError(
        "provider_unavailable",
        f"{name} could not answer (HTTP {status}). Try again later.",
    )
