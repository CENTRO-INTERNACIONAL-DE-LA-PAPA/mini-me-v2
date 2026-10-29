# Spec Delta

## MODIFIED Requirements

### Requirement: Tools offered to the model
A prompt-based Trait's model SHALL be offered read-a-file and read-a-component on every
call, plus the tools its Trait definition lists. A prompt-based Trait SHALL list only tools
that have a form for models: save-a-file, show-a-table, write-a-document and suggest-an-edit.
Suggest-an-edit SHALL be offered only to a call answering a comment thread.

#### Scenario: Assistant's tools
- **WHEN** Assistant answers in a Conversation
- **THEN** its model is offered read-a-file, read-a-component, save-a-file, show-a-table and
  write-a-document

#### Scenario: Assistant in a comment thread
- **WHEN** Assistant answers "@Assistant is this clear?" in a comment thread
- **THEN** its model is also offered suggest-an-edit

#### Scenario: Scout's tools
- **WHEN** Explorer answers with *Scout*, which lists no tools
- **THEN** its model is offered only read-a-file and read-a-component
