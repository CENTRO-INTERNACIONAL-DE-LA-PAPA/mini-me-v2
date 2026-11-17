# Design

## Context

See proposal.md for the motivation; the requirements are in the delta specs.

- The provider list lives in three places: `secrets::PROVIDERS` in the Rust core (which IDs are
  providers, their names, and the keychain accounts), `PROVIDERS` in `SettingsView.tsx`, and
  `PROVIDER_NAMES` in the sidecar's `adapters/providers.py`. Adapters that call a model declare
  `providers=tuple(PROVIDER_NAMES)`, so adding to that map also declares the new provider.
- `AiSettings { provider, model }` is saved in the app settings file. `AiSettings::model()`
  turns it into `CallModel { provider, model }`, which goes into `run.start`, summary, draft
  and model-test requests.
- The core answers `secret.get` from the keychain (`runs.rs` `secret_value`). A missing key is
  `secret_unavailable`.
- In the sidecar, three places build `Model` from a frame's dict (`context.py`, `summary.py`,
  `documents.py`), and every model call goes through `providers.chat_model(model, key)`.
  OpenRouter already reuses `ChatOpenAI` with a `base_url`.

## Goals / Non-Goals

**Goals:**
- Custom behaves like the other providers everywhere a model is called, with no change to
  adapters, Traits or Workflows.
- Existing settings files load unchanged, and the other providers' behaviour stays the same.

**Non-Goals:**
- Making the provider list data-driven or defined in one process. It stays in three places,
  as it is today.

## Decisions

### The endpoint and format are settings, not secrets (Rust core)
`AiSettings` gains `custom: CustomEndpoint { endpoint: String, api_format: ApiFormat }`, with
`#[serde(default)]` so older settings files load. It is saved whichever provider is chosen, so
switching away from Custom and back keeps it. `ApiFormat` is an enum, `openai` | `anthropic`,
serialized in lowercase. The UI reads both back through `get_ai_settings`.

*Alternative:* the endpoint in the keychain. Rejected by the user: a URL is not a secret, and
the user needs to see which endpoint is saved.

### Validation lives in `AiSettings::new` (Rust core)
`AiSettings::new` takes the endpoint and format. For `custom` it trims the endpoint, parses it
with `reqwest::Url`, and refuses anything other than `http`/`https` with a host, with
`invalid_input`. `set_ai_model` and `test_model` both build through it, so a test also refuses
a bad endpoint before anything is sent. For other providers the endpoint fields are stored
as given and not checked. The UI checks nothing itself; it shows the core's message.

### `CallModel` carries the endpoint only for Custom (Rust core, protocol)
`CallModel` gains `endpoint: Option<String>` and `api_format: Option<ApiFormat>`, skipped when
`None`, so the frames for the other providers stay byte-for-byte as they are (trait-execution
delta). `AiSettings::model()` fills them only when the provider is `custom`.

### A missing Custom key is answered with an empty value (Rust core)
In `secret_value`, when the provider is `custom` and the keychain holds nothing, the core
answers `{ value: "" }` instead of `secret_unavailable`. The core owns secrets, so it decides
what "no key" means. The sidecar asks for and handles the key the same way for every provider.

*Alternative:* the sidecar catches `secret_unavailable` for `custom`. Rejected: provider-specific
secret rules would then live in the sidecar, next to the core's own `secret_not_allowed` checks.

### One `Model.from_frame` reads the model (sidecar)
`Model` gains `endpoint: str | None` and `api_format: str | None`. Today the dict-to-`Model`
code exists three times. Adding fields to three copies would add a fourth reason to change
each one, so it becomes one `Model.from_frame(raw)` in `context.py`, used by all three callers.

### `chat_model` builds the client from the format (sidecar)
For `custom`, `chat_model` builds `ChatOpenAI(base_url=endpoint, …)` for `openai` and
`ChatAnthropic(base_url=endpoint, max_tokens=ANTHROPIC_MAX_TOKENS, …)` for `anthropic`. The
OpenAI and Anthropic clients both refuse to send a request without a key, so with no key
either is given a fixed placeholder that servers without auth ignore. The
integrations are imported inside the function, as today, so neither package loads until it
is used.

### Errors name the endpoint only when it cannot be reached (sidecar)
`PROVIDER_NAMES["custom"] = "Custom"`. In `provider_error`, the "could not reach" branch (no
HTTP status) for `custom` names the endpoint and points to Settings, instead of asking the
user to check their internet connection. Every other branch is shared with the other
providers. `log_error` already removes the key and key-like strings. The endpoint is not
secret, so it may appear in the log.

### Settings UI (UI)
- `PROVIDERS` gains `{ id: "custom", name: "Custom" }`. The Providers list gets a Custom key
  row with the hint "Add an API key if your endpoint needs one".
- `ModelRow`: when Custom is selected, a second line under the provider and model shows the
  API format `Select` ("OpenAI-compatible", "Anthropic-compatible") and the Endpoint `Input`
  (placeholder `http://localhost:1234/v1`). "Changed" also counts the endpoint and format.
  Save and "Test model" send all four values. Errors appear where they do today: the row's
  status for Save, and the popover for Test.
- `api.setAiModel` and `api.testModel` take `{ provider, model, endpoint, api_format }`. The
  `AiSettings` type gains `custom: { endpoint, api_format }`.

## Risks / Trade-offs

- [Servers differ in how they implement "OpenAI-compatible", especially tool calling] →
  "Test model" already checks the one thing Mini-Mes need, a tool call, and says so when it
  fails (`tools_unsupported`).
- [Over plain `http://` on a network, the key and material are not encrypted] → Settings warns
  about it (see "Settled while planning").
- [The placeholder key reaches servers that do check auth] → Such a server
  answers 401, which becomes the usual `provider_auth` message: "Custom rejected the API key.
  Replace it in Settings."
- [Some servers expect the base URL with `/v1`, others without] → The endpoint is used exactly
  as typed, and the placeholder shows the `/v1` form. `docs/using.md` gives one example for
  each format.

## Migration Plan

None. Old settings files load with an empty Custom endpoint and the format `openai`. Rollback
is the previous build: older builds ignore the unknown `custom` field. If the provider is set
to `custom` when an older build reads the file, it rejects it as an unknown provider.

## Settled while planning
- **Plain HTTP:** a one-line warning under the endpoint when it is `http://` to a host other
  than `localhost`, `127.0.0.1` or `::1`. Saving still works. *Alternatives:* no warning, or
  refusing `http://` except for local hosts.
- **Name in error messages:** "Custom", as in Settings ("Custom rejected the API key.").
  *Alternative:* "your custom endpoint", which reads better but is a second name to keep in step
  across the core and the sidecar.
- **No key saved:** a fixed placeholder key, `not-needed`, which servers without auth
  ignore. *Alternative:* removing the `Authorization` header with a custom HTTP client,
  which is more code.
