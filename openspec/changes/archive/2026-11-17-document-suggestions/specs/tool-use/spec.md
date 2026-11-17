## MODIFIED Requirements

### Requirement: Tools offered to the model
A prompt-based Trait's model SHALL be offered, on every call, every tool that has a form for
models: read-a-file, read-a-component, hand-off, save-a-file, show-a-table, write-a-document and
suggest. The tools offered SHALL NOT depend on the Trait, nor on whether the call answers a
comment thread.

#### Scenario: Assistant's tools
- **WHEN** Assistant answers in a Conversation
- **THEN** its model is offered read-a-file, read-a-component, hand-off, save-a-file,
  show-a-table, write-a-document and suggest

#### Scenario: Assistant in a comment thread
- **WHEN** Assistant answers "@Assistant is this clear?" in a comment thread
- **THEN** its model is offered the same tools

#### Scenario: Scout's tools
- **WHEN** Explorer answers with *Scout*
- **THEN** its model is offered the same tools as Assistant's
