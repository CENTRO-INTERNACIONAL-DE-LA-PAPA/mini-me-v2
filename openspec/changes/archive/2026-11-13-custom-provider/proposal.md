# Proposal

## Why

Mini-Mes can call only OpenAI, Anthropic, Google and OpenRouter. Scientists who run a model on
their own machine or on an institutional server (LM Studio, Ollama, vLLM, a LiteLLM gateway, an
Anthropic-compatible proxy) cannot use it. A "Custom" provider that takes an endpoint and an
optional API key lets them use any server that speaks the OpenAI or Anthropic API.

## What Changes

- A fifth AI provider, **Custom** (ID `custom`), in Settings → Models & keys.
- When Custom is the chosen provider, the AI model row also shows an **API format** choice
  (OpenAI-compatible or Anthropic-compatible) and an **Endpoint** URL. Both are saved in the app
  settings with the provider and model, and are kept when the user switches to another provider
  and back.
- Saving or testing Custom is refused while the endpoint is empty or is not an `http://` or
  `https://` URL.
- The Custom API key is saved in the OS keychain like the other keys, under the account
  `custom`, and is **optional**: with no key saved, Custom calls go out with a placeholder key
  instead of failing with `secret_unavailable`.
- Every AI call (Mini-Me Traits, model decisions in Workflows, summaries, document drafts,
  "Test model") sends the request to the Custom endpoint in the chosen format.
- When the Custom endpoint cannot be reached, the error names the endpoint and points to
  Settings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ai-providers`: Custom joins the supported providers. The model setting gains the Custom
  endpoint and API format. The prompt adapter calls the endpoint in that format. "Test model"
  sends the endpoint and format from the fields. A new requirement covers the endpoint and its
  validation.
- `trait-execution`: `run.start`'s `model` carries `endpoint` and `api_format` when the
  provider is `custom`. The same model shape goes to summary, draft and test requests.
- `credentials`: a missing Custom key is not an error. Settings → Models & keys shows a Custom
  key row.

## Out of scope

- More than one custom endpoint, or named endpoints.
- API formats other than OpenAI-compatible and Anthropic-compatible (for example Google's).
- Listing or discovering the models an endpoint offers. The user types the model ID, as for the
  other providers.
- Custom HTTP headers, client certificates, or proxy settings.
- Using a Custom endpoint for routing. Jev stays on Typesafe.

## Credentials, services and cost

- **New credential:** an optional API key for the user's own endpoint, kept in the OS keychain
  and never shown back in the UI, like the other keys.
- **New external service:** whatever server the user names. Mini-Me sends that server the same
  material it sends any provider: Trait instructions, messages and the referenced Assets. The
  user is responsible for trusting that server.
- **Plain HTTP:** `http://` endpoints are accepted so local servers (`http://localhost:…`) work.
  Over plain HTTP on a network, the key and the material are not encrypted. Settings warns
  when the endpoint is `http://` to a host other than this computer.
- **Cost:** none added by Mini-Me. Any charges are the endpoint owner's, as with the other
  providers.

## Impact

- Rust core: `secrets.rs` (provider list), `settings.rs` (`AiSettings` gains the Custom
  endpoint and format, with defaults so existing settings files still load), `link.rs`
  (`CallModel` carries the endpoint and format for `custom`), `ipc.rs` (`get_ai_settings`,
  `set_ai_model`, `test_model`), `runs.rs` (`secret.get` answers an empty key for `custom`).
- Sidecar: `context.py` (`Model` gains the endpoint and format, and one helper reads it from a
  frame), `adapters/providers.py` (builds the client for `custom`, plus error text),
  `summary.py`, `documents.py`.
- UI: `SettingsView.tsx` (provider list, AI model row, key row), `api.ts` and its types.
- Docs: `docs/using.md` (setting up a provider). No new dependencies: the sidecar already
  ships `langchain-openai` and `langchain-anthropic`, and the core parses URLs with
  `reqwest::Url`.
