# Tasks

## 1. Core: settings and the Custom provider

- [x] 1.1 Add `("custom", "Custom")` to `secrets::PROVIDERS` and to the keychain accounts.
  Verify: `cd src-tauri && cargo test` passes.
- [x] 1.2 Add `CustomEndpoint { endpoint, api_format }` and `ApiFormat` to `AiSettings` with
  serde defaults, and validate the endpoint in `AiSettings::new` for `custom` (http/https URL
  with a host). Extend the existing settings test with the endpoint cases (empty, `localhost:1234`,
  `ftp://…`, a valid `http://localhost:1234/v1`), and check that a settings file without
  `custom` still loads. Verify: `cd src-tauri && cargo test settings` passes.
- [x] 1.3 Add `endpoint` and `api_format` to `CallModel`, skipped when `None`, and have
  `AiSettings::model()` fill them only for `custom`. Extend the model test to cover a Custom
  model and an OpenAI model without the fields. Verify: `cd src-tauri && cargo test` passes.
- [x] 1.4 Have `secret_value` answer `{ value: "" }` for `custom` with no saved key. Add that
  case to the existing `secret_unavailable` test. Verify: `cd src-tauri && cargo test runs`
  passes.
- [x] 1.5 Pass `endpoint` and `api_format` through `set_ai_model`, `test_model` and
  `get_ai_settings`. Verify: `cd src-tauri && cargo test` passes and `cargo clippy` is clean.

## 2. Sidecar: calling the endpoint

- [x] 2.1 Add `endpoint` and `api_format` to `Model`, and replace the three dict-to-`Model`
  copies (`context.py`, `summary.py`, `documents.py`) with one `Model.from_frame`. Verify:
  `cd sidecar && uv run pytest` passes.
- [x] 2.2 Add `"custom": "Custom"` to `PROVIDER_NAMES`, and build `ChatOpenAI` or `ChatAnthropic`
  with `base_url` from the endpoint in `chat_model`. With no key, both clients get the
  placeholder (design, "Settled while planning"). Verify:
  `cd sidecar && uv run pytest` passes.
- [x] 2.3 In `provider_error`, give `custom` an unreachable-endpoint message that names the
  endpoint and points to Settings. Add the case to the existing `test_providers.py` error test.
  Verify: `cd sidecar && uv run pytest tests/test_providers.py` passes.
- [x] 2.4 Check the Custom wording of the shared error messages ("Custom rejected the API
  key…", design, "Settled while planning"). Verify: the `test_providers.py` case from 2.3 asserts the
  `provider_auth` text for `custom`.

## 3. UI: Settings

- [x] 3.1 Update the `AiSettings` type, `api.setAiModel` and `api.testModel` for the endpoint
  and format. Verify: `npx tsc --noEmit` is clean.
- [x] 3.2 Add Custom to `PROVIDERS` and its key row with the hint "Add an API key if your
  endpoint needs one". Verify in the app: Settings → Models & keys lists Custom, and saving and
  removing a Custom key works.
- [x] 3.3 In `ModelRow`, show the API format and Endpoint fields when Custom is selected,
  include them in "changed", Save and "Test model", and show the plain-HTTP warning (design,
  "Settled while planning"). Verify in the app: Save with an empty endpoint shows the core's message;
  "Test model" against a running local server (LM Studio or Ollama) says the model works;
  switching to OpenAI and back keeps the endpoint. Run `npm test` and `npx tsc --noEmit`.

## 4. Docs and end-to-end check

- [x] 4.1 Add Custom to the provider setup steps in `docs/using.md`, with one endpoint example
  for each format and a note that the key is optional. Verify: the steps match the Settings
  page.
- [x] 4.2 End to end in the app: with Custom (OpenAI-compatible, a local server, no key), ask
  Scribe for a summary and Assistant a question that saves a file. Then stop the server and ask
  again: the reply fails with the message that names the endpoint. Verify: both behave as the
  specs' scenarios describe.

## Workflow follow-up

- Add a "New" line to `CHANGELOG.md`, for example "Use your own AI server: choose Custom in
  Settings and type its address."
- Archive the change (`/opsx:archive`) and open the pull request from `feat/custom-provider`
  into `dev` after the user approves.
