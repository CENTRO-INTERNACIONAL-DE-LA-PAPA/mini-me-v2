# Spec Delta

## MODIFIED Requirements

### Requirement: Prompt adapter
The sidecar's `prompt` adapter SHALL declare all four providers. For each call it SHALL
request the secret for `model.provider`, send the Trait's `instructions` as the system
prompt and the call's material as the user prompt to that provider's model, and stream the
model's text as it arrives. It SHALL call the provider's official API directly, or
OpenRouter's API for `openrouter`.

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

## ADDED Requirements

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
