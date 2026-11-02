# Spec Delta

## ADDED Requirements

### Requirement: Naming a Conversation from its first message
When the first message of a Conversation with the default title is sent, the core SHALL ask the AI
model chosen in Settings for a short title for its subject, without waiting for the reply, and set it
only if the Conversation still has the default title. It SHALL set a title once. With no AI model set, no key, or a model that cannot
answer, the title SHALL stay and nothing SHALL fail.

#### Scenario: A new Conversation
- **WHEN** the user asks to translate a greeting
- **THEN** within a few seconds, usually while the reply is still being written, the sidebar and the header show a title that describes the task, not the greeting's words

#### Scenario: A renamed Conversation
- **WHEN** the user renamed the Conversation before the title arrived
- **THEN** the user's title stays

#### Scenario: Later messages
- **WHEN** a second message is sent in a Conversation that kept the default title
- **THEN** it is not named from that message

#### Scenario: No AI key
- **WHEN** no AI model or key is set and the first message is sent
- **THEN** the default title stays and nothing fails
