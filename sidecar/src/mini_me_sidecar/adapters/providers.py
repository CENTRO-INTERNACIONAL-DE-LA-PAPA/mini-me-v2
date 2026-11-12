"""A LangChain chat model per provider, and SDK errors turned into messages the user can act on."""

import re
import sys
from typing import Any

from pydantic import BaseModel, ValidationError

from mini_me_sidecar import debug
from mini_me_sidecar.adapters.base import require_model
from mini_me_sidecar.context import CallContext, Model, TraitError

PROVIDER_NAMES = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "openrouter": "OpenRouter",
}

OPENROUTER_URL = "https://openrouter.ai/api/v1"

HTTP_STATUS = re.compile(r"\b([45]\d\d)\b")

# Errors for a model that cannot call tools; checked before the status, which is often a 404.
NO_TOOLS = re.compile(
    r"support(s|ing)? tool|tool use|tool_use|tools? (are|is) not supported|function call",
    re.IGNORECASE,
)

# Errors for a model that takes tools but cannot be forced to call one.
NO_FORCED_TOOL = re.compile(r"tool_choice.{0,80}not supported", re.IGNORECASE | re.DOTALL)

# Errors for a request longer than the model's context.
TOO_LONG = re.compile(
    r"context[ _](length|window)|prompt is too long|too many tokens|maximum.{0,30}tokens|"
    r"tokens?.{0,30}exceed",
    re.IGNORECASE,
)

# Shapes of provider API keys, removed from logged errors along with the key itself.
KEY_LIKE = re.compile(r"\b(sk-[\w-]+|AIza[\w-]+)")

MAX_LOGGED_CHARS = 600

# Anthropic requires an output limit; this leaves room for long summaries.
ANTHROPIC_MAX_TOKENS = 4096

# Finish reasons of a provider's safety filter; asking again gets the same verdict.
REFUSED = {"content_filter", "refusal"}


def chat_model(model: Model, key: str) -> Any:
    """Records its calls inside `debug.recording`. Integrations are imported here so the
    sidecar starts quickly and an unused provider's package never loads."""
    callbacks = debug.callbacks(model)
    match model.provider:
        case "openai" | "openrouter":
            from langchain_openai import ChatOpenAI

            base_url = OPENROUTER_URL if model.provider == "openrouter" else None
            return ChatOpenAI(
                model=model.model, api_key=key, base_url=base_url, callbacks=callbacks
            )
        case "anthropic":
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(
                model=model.model,
                api_key=key,
                max_tokens=ANTHROPIC_MAX_TOKENS,
                callbacks=callbacks,
            )
        case "google":
            from langchain_google_genai import ChatGoogleGenerativeAI

            return ChatGoogleGenerativeAI(
                model=model.model, google_api_key=key, callbacks=callbacks
            )
    raise TraitError("provider_unavailable", f"Unknown provider {model.provider!r}.")


async def structured_answer(chat: Any, schema: type[BaseModel], turns: list[Any]) -> Any:
    """An instance of `schema`, or None. A model refusing the forced tool call (as some do with
    thinking on) is offered the tool instead."""
    try:
        return await chat.with_structured_output(schema, method="function_calling").ainvoke(turns)
    except Exception as error:
        if not NO_FORCED_TOOL.search(str(error)):
            raise
    reply = await chat.bind_tools([schema], tool_choice="auto").ainvoke(turns)
    calls = getattr(reply, "tool_calls", None) or []
    try:
        return schema(**calls[0]["args"]) if calls else None
    except ValidationError:
        return None


async def ask_structured(
    ctx: CallContext, schema: type[BaseModel], turns: list[Any], none_if_invalid: bool = False
) -> Any:
    """Errors become `provider_error`s; with `none_if_invalid`, an off-schema answer is None."""
    model = require_model(ctx)
    key = await ctx.secret(model.provider)
    try:
        return await structured_answer(chat_model(model, key.reveal()), schema, turns)
    except TraitError:
        raise
    except Exception as error:
        if none_if_invalid and isinstance(error, ValidationError):
            return None
        log_error(error, model, key.reveal())
        raise provider_error(error, model) from None


def filtered(ending: dict[str, Any]) -> bool:
    """Whether the provider ended the stream because a content filter or refusal stopped it."""
    return ending.get("finish_reason") in REFUSED or ending.get("stop_reason") in REFUSED


def provider_error(error: Exception, model: Model) -> TraitError:
    """An error the user can act on; the provider's text, which may echo the key, is never shown."""
    name = PROVIDER_NAMES[model.provider]
    # `status_code` on OpenAI and Anthropic errors, `code` on Google ones; integrations that
    # wrap the SDK's error keep the status only in the text.
    status = getattr(error, "status_code", None)
    if not isinstance(status, int):
        code = getattr(error, "code", None)
        status = code if isinstance(code, int) else None
    if status is None and (found := HTTP_STATUS.search(str(error))):
        status = int(found.group(1))

    # The text only picks a message; it is never shown.
    if NO_FORCED_TOOL.search(str(error)):
        return TraitError(
            "tools_unsupported",
            f"{model.model} cannot be made to call a tool, which this step needs. Choose "
            "another model in Settings.",
        )
    if NO_TOOLS.search(str(error)):
        return TraitError(
            "tools_unsupported",
            f"{model.model} cannot use tools, which this Mini-Me needs. Choose another model in "
            "Settings.",
        )
    if TOO_LONG.search(str(error)):
        return TraitError(
            "provider_context",
            f"The Conversation and its files are too long for {model.model}. Start a new "
            "Conversation or choose a model that reads more at once in Settings.",
        )

    # Google answers an invalid key with 400 rather than 401.
    if status in (401, 403) or (status == 400 and "api key" in str(error).lower()):
        return TraitError(
            "provider_auth",
            f"{name} rejected the API key. Replace it in Settings.",
        )
    if status == 404:
        return TraitError(
            "provider_model",
            f"{name} has no model called {model.model!r}, or does not offer it right now. "
            "Check the model in Settings or choose another.",
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


def log_error(error: Exception, model: Model, key: str) -> None:
    """Logs `error` with anything key-like removed; the user sees only `provider_error`."""
    text = str(error).replace(key, "[redacted]") if key else str(error)
    text = KEY_LIKE.sub("[redacted]", text)[:MAX_LOGGED_CHARS]
    status = getattr(error, "status_code", None)
    print(
        f"[{model.provider}] {type(error).__name__} (status {status}): {text}",
        file=sys.stderr,
        flush=True,
    )
