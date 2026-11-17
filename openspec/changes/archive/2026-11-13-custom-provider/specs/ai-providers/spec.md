# Spec Delta

## MODIFIED Requirements

### Requirement: Supported providers
Mini-Me SHALL support the providers `openai` (OpenAI), `anthropic` (Anthropic), `google`
(Google Gemini), `openrouter` (OpenRouter) and `custom` (Custom, a server the user names). Each
provider is used with the user's own API key; for Custom the key is optional.

#### Scenario: Provider list in Settings
- **WHEN** the user opens Settings
- **THEN** they can choose among OpenAI, Anthropic, Google, OpenRouter and Custom

### Requirement: Provider and default model setting
The user SHALL choose one provider and type one model ID for that provider in Settings.
Every AI Trait call SHALL use that provider and model. The choice SHALL be stored with the
app settings, outside the Mini-Me Data folder, and SHALL survive a restart. Until a model is
set, AI Trait calls SHALL fail with code `model_not_set` and a message pointing to Settings.

#### Scenario: Changing the model
- **WHEN** the user sets the provider to Anthropic with a model ID and then asks Scribe for a
  summary
- **THEN** the call's `model` is `{ provider: "anthropic", model: <that ID> }`

#### Scenario: No model chosen
- **WHEN** no model is set and the user asks Scribe for a summary
- **THEN** the reply fails with code `model_not_set`, and its message says to choose a model
  in Settings

#### Scenario: Custom model
- **WHEN** the user sets the provider to Custom with the format OpenAI-compatible, the endpoint
  `http://localhost:1234/v1` and a model ID, and then asks Scribe for a summary
- **THEN** the call's `model` is `{ provider: "custom", model: <that ID>, endpoint:
  "http://localhost:1234/v1", api_format: "openai" }`

### Requirement: Prompt adapter
The sidecar's `prompt` adapter SHALL declare all five providers. For each call it SHALL
request the secret for `model.provider`, send the Trait's `instructions` as the system
prompt and the call's material as the user prompt to that provider's model, and stream the
model's text as it arrives. It SHALL call the provider's official API directly, OpenRouter's
API for `openrouter`, or the Custom endpoint in its API format for `custom`.

#### Scenario: Streaming answer
- **WHEN** the prompt adapter runs as a one-Step Workflow with a valid key and model
- **THEN** the reply's text grows as the provider streams its answer and the run ends with
  `run.done`

#### Scenario: Cancelling
- **WHEN** the user stops a reply produced by the prompt adapter
- **THEN** the adapter stops reading the provider's stream and the run ends as cancelled

#### Scenario: Self-contained message
- **WHEN** Jev answers `needs_context` with `no`
- **THEN** the call sends no `conversation.history` request

#### Scenario: Anthropic-compatible endpoint
- **WHEN** the provider is Custom with the format Anthropic-compatible and the user asks Scribe
  for a summary
- **THEN** the request goes to the Custom endpoint in Anthropic's Messages API format, and the
  reply streams as it does for Anthropic

### Requirement: Testing the model
Settings' Models & keys page SHALL have a "Test model" icon button, a flask with that name as its
label, beside Save. It SHALL send the provider and model in the fields, saved or not, and for
Custom the endpoint and API format in the fields, saved or not, one small request that needs a
tool call, which every Mini-Me depends on, and SHALL show that the model works with Mini-Me, or
why it did not pass, with the same messages as a failed reply, in a small popover that opens over
the button, and not in the row's description. The button SHALL be unavailable while the model
field is empty or a test is running. The result SHALL be shown only: it is not stored, and
clicking outside the popover closes it.

#### Scenario: A model that calls tools
- **WHEN** the user types a model that supports tool calls and presses "Test model"
- **THEN** the popover says "Testing the model…" and then that the model works with Mini-Me

#### Scenario: A model that does not
- **WHEN** the user tests a model that does not call the tool it is offered
- **THEN** the popover says the model did not call the tool, which Mini-Mes need, and to choose
  another model in Settings

#### Scenario: Untested changes
- **WHEN** the user presses "Test model" with a model they have not saved
- **THEN** that model is tested, and the saved model is unchanged

#### Scenario: Unsaved Custom endpoint
- **WHEN** Custom is saved with one endpoint, and the user types another endpoint and presses
  "Test model"
- **THEN** the typed endpoint is tested, and the saved endpoint is unchanged

## ADDED Requirements

### Requirement: Custom endpoint and API format
When Custom is chosen, Settings SHALL show an API format choice, OpenAI-compatible (`openai`) or
Anthropic-compatible (`anthropic`), and an Endpoint field. Saving or testing SHALL be refused
with code `invalid_input` and a message saying what to fix while the endpoint is empty or is
not an absolute `http://` or `https://` URL. The endpoint and format SHALL be stored with the
app settings and kept while another provider is chosen.

#### Scenario: Endpoint required
- **WHEN** the user chooses Custom, types a model ID, leaves the endpoint empty and presses
  Save
- **THEN** nothing is saved, and the row says to type the endpoint's URL

#### Scenario: Not a web address
- **WHEN** the user types `localhost:1234` or `ftp://models.example.org` as the endpoint and
  presses "Test model"
- **THEN** no request is sent, and the popover says the endpoint must start with `http://` or
  `https://`

#### Scenario: Switching back to Custom
- **WHEN** the user saves Custom with an endpoint, switches to OpenAI and saves, and then
  chooses Custom again
- **THEN** the endpoint and format fields show what was saved for Custom

### Requirement: Unreachable Custom endpoint
When a Custom call cannot reach the endpoint, the call SHALL fail with `provider_unavailable`
and a message that names the endpoint and says to check it in Settings. Other provider errors
SHALL use the same codes and messages as the other providers, with the provider named
"Custom".

#### Scenario: Server not running
- **WHEN** the provider is Custom with the endpoint `http://localhost:1234/v1`, nothing listens
  there, and the user asks Scribe for a summary
- **THEN** the reply fails with `provider_unavailable`, and its message names
  `http://localhost:1234/v1` and says to check the endpoint in Settings
