# Spec Delta

## ADDED Requirements

### Requirement: Replies start with the answer
The prompt adapter's system prompt SHALL tell the model to start with its answer, with no
title, heading or introduction that restates the request, before the Trait's instructions.
This holds for every Trait the adapter runs, with or without a `mini_me_name`.

#### Scenario: No restating title
- **WHEN** the user sends "@Skeptic the sky is blue"
- **THEN** Skeptic's reply starts with its argument, not with a title such as "Skeptic's
  response to "the sky is blue""
