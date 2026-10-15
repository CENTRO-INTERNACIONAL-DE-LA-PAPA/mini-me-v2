# ai-providers Specification

## Purpose

Defines which AI providers Mini-Me supports, how the user chooses the provider and default
model that AI Traits use, and how the prompt adapter calls them.

## Requirements

### Requirement: Supported providers
Mini-Me SHALL support the providers `openai` (OpenAI), `anthropic` (Anthropic), `google`
(Google Gemini) and `openrouter` (OpenRouter). Each provider is used with the user's own API
key.

#### Scenario: Provider list in Settings
- **WHEN** the user opens Settings
- **THEN** they can choose among OpenAI, Anthropic, Google and OpenRouter

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

### Requirement: Prompt adapter
The sidecar's `prompt` adapter SHALL declare all four providers. For each call it SHALL
request the secret for `model.provider`, send the Trait's `instructions` as the system
prompt and the call's material as the user prompt to that provider's model, and stream the
model's text into the reply as it arrives. It SHALL call the provider's official API
directly, or OpenRouter's API for `openrouter`.

#### Scenario: Streaming answer
- **WHEN** the prompt adapter runs with a valid key and model
- **THEN** the reply's text grows as the provider streams its answer and the call ends with
  `call.done`

#### Scenario: Cancelling
- **WHEN** the user stops a reply produced by the prompt adapter
- **THEN** the adapter stops reading the provider's stream and the call ends as cancelled

### Requirement: Provider errors are actionable
The prompt adapter SHALL end the call with these error codes, each with a message the user
can act on and that contains no secret:
- `provider_auth`: the provider rejected the key;
- `provider_model`: the model ID was not found;
- `provider_rate_limit`: the provider is rate-limiting or the account is out of credit;
- `provider_unavailable`: the provider could not be reached or failed;
- `input_too_large`: the material exceeds 400,000 characters.

#### Scenario: Wrong key
- **WHEN** the stored OpenAI key is invalid and the user asks Scribe for a summary
- **THEN** the reply fails with code `provider_auth` and a message saying the OpenAI key was
  rejected and can be replaced in Settings

### Requirement: Provider calls stay out of Projects
The prompt adapter SHALL read Project content only through `asset.read` for Assets of the
call's Project, and SHALL write nothing to disk. What it sends to the provider is limited to
the Trait's instructions, the message text and those Assets.

#### Scenario: Only referenced Assets are sent
- **WHEN** a Project has ten Assets and the message references one
- **THEN** only that one Asset's content is sent to the provider

### Requirement: Earlier messages as chat turns
When `context.needs_context` is `true` or `null`, the prompt adapter SHALL request the
history and send its entries before the current material as chat turns:
- the user's messages as user turns;
- the calling Mini-Me's own replies as assistant turns;
- other Mini-Mes' replies as user-side context introduced by "<Name> replied:".

Incomplete replies are marked as such, and consecutive turns of the same kind are merged.
When `needs_context` is `false`, it SHALL request and send no history.

#### Scenario: Building on another Mini-Me
- **WHEN** Scribe summarized a file and the user then sends "@Assistant what would you
  test next, based on that?"
- **THEN** Assistant's model receives Scribe's summary as user-side context introduced by
  "Scribe replied:", and Assistant's reply does not start with another Mini-Me's name

#### Scenario: Self-contained message
- **WHEN** Jev answers `needs_context` with `no`
- **THEN** the call sends no `conversation.history` request

### Requirement: The model knows which Mini-Me it is
When the call has a `mini_me_name`, the prompt adapter SHALL start the system prompt with
"You are <name>, a Mini-Me.".

#### Scenario: Assistant's call
- **WHEN** Assistant's Trait runs
- **THEN** the system prompt starts with "You are Assistant, a Mini-Me."
