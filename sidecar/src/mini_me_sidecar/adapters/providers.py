"""The AI providers a Trait can call: a LangChain chat model for each, and the errors their
SDKs raise turned into messages the user can act on."""

import re
import sys
from typing import Any

from mini_me_sidecar.context import Model, TraitError

PROVIDER_NAMES = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "openrouter": "OpenRouter",
}

OPENROUTER_URL = "https://openrouter.ai/api/v1"

HTTP_STATUS = re.compile(r"\b([45]\d\d)\b")

# Shapes of provider API keys, removed from logged errors along with the key itself.
KEY_LIKE = re.compile(r"\b(sk-[\w-]+|AIza[\w-]+)")

MAX_LOGGED_CHARS = 600

# Anthropic requires an output limit; this leaves room for long summaries.
ANTHROPIC_MAX_TOKENS = 4096


def chat_model(model: Model, key: str) -> Any:
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


def provider_error(error: Exception, model: Model) -> TraitError:
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


def log_error(error: Exception, model: Model, key: str) -> None:
    """Writes a provider's error to the sidecar log, for diagnosis, with the API key and
    anything shaped like a key removed. The user sees only `provider_error`'s message."""
    text = str(error).replace(key, "[redacted]") if key else str(error)
    text = KEY_LIKE.sub("[redacted]", text)[:MAX_LOGGED_CHARS]
    status = getattr(error, "status_code", None)
    print(
        f"[{model.provider}] {type(error).__name__} (status {status}): {text}",
        file=sys.stderr,
        flush=True,
    )
