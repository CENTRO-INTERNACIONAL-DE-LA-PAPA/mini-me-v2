# ai-providers Specification

## Purpose

Defines which AI providers Mini-Me supports, how the user chooses the provider and default
model that AI Traits use, and how the prompt adapter calls them.

## Requirements

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

### Requirement: Provider errors are actionable
The prompt adapter SHALL end the call with these error codes, each with a message the user
can act on and that contains no secret:
- `provider_auth`: the provider rejected the key;
- `provider_model`: the model ID was not found;
- `provider_rate_limit`: the provider is rate-limiting or the account is out of credit;
- `provider_unavailable`: the provider could not be reached or failed;
- `provider_context`: the request is longer than the model reads at once;
- `tools_unsupported`: the model cannot call tools, or cannot be made to call one, which
  Mini-Mes need;
- `input_too_large`: the material exceeds 400,000 characters.

#### Scenario: Wrong key
- **WHEN** the stored OpenAI key is invalid and the user asks Scribe for a summary
- **THEN** the reply fails with code `provider_auth` and a message saying the OpenAI key was
  rejected and can be replaced in Settings

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

### Requirement: Replies start with the answer
The prompt adapter's system prompt SHALL tell the model to start with its answer, with no
title, heading or introduction that restates the request, before the Trait's instructions.
This holds for every Trait the adapter runs, with or without a `mini_me_name`.

#### Scenario: No restating title
- **WHEN** the user sends "@Skeptic the sky is blue"
- **THEN** Skeptic's reply starts with its argument, not with a title such as "Skeptic's
  response to "the sky is blue""

### Requirement: The model knows whose research it serves
The prompt adapter's system prompt SHALL say, before the Trait's instructions, that the model
works for scientists at the International Potato Center (CIP) on agricultural research,
including plant diseases, their pathogens and pests. This holds for every Trait the adapter
runs, with or without a `mini_me_name`. The user's message SHALL NOT be changed to get past a
provider's safety filter.

#### Scenario: Experiment call
- **WHEN** Experimenter's *Experiment* Trait runs
- **THEN** its system prompt says it works for CIP scientists on agricultural research,
  before *Experiment*'s instructions

### Requirement: Earlier Step outputs in the prompt
When a prompt adapter call has earlier Step outputs, it SHALL send them to the model after
the Conversation's earlier messages and before the call's material, as one user turn that
says they come from earlier Steps of this Mini-Me's Workflow. Each output SHALL be under a
`--- <name> ---` line, in order.

#### Scenario: Plan sees the critique
- **WHEN** Investigator's second *Plan* Step runs after *Refute* wrote a critique
- **THEN** the model receives the critique under `--- Refute ---` before the user's message

#### Scenario: One-Step Workflow
- **WHEN** Scribe's call has no earlier Step outputs
- **THEN** the turns sent to the model are the same as without Workflows

### Requirement: A Step knows it is part of a Workflow
When a prompt adapter call has earlier Step outputs, its system prompt SHALL say that the
call is one Step of the Mini-Me's Workflow, that the earlier outputs and the user's message
together are its material, and that it does not comment on what the user's message alone
lacks.

#### Scenario: Experiment after a plan
- **WHEN** Investigator's *Experiment* Step runs after a *Plan* Step whose output states a
  hypothesis, and the user's message is a question
- **THEN** the system prompt tells the model it is a Step of Investigator's Workflow, and
  the reply designs an experiment for that hypothesis without saying the message holds none

#### Scenario: One-Step Workflow
- **WHEN** Scribe's call has no earlier Step outputs
- **THEN** its system prompt has no Workflow sentence

### Requirement: Answers a content filter stopped partway fail
When the provider ends a prompt adapter call's stream with a content-filter or refusal
finish reason after some text, the call SHALL fail with `provider_refused` and a message
saying the provider's filter stopped the answer partway. The text already written stays in
the reply, and in a Workflow no later Step runs.

#### Scenario: Cut off mid-answer
- **WHEN** a *Wonder* Step's stream ends with finish reason `content_filter` after one line
- **THEN** the run fails with `provider_refused`, and *Plan* does not run with the cut-off
  output

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
