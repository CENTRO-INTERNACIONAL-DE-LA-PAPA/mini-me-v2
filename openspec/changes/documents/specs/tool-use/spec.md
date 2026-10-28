# Spec Delta

## MODIFIED Requirements

### Requirement: Tools offered to the model
A prompt-based Trait's model SHALL be offered read-a-file and read-a-component on every
call, plus the tools its Trait definition lists. A prompt-based Trait SHALL list only tools
that have a form for models: save-a-file, show-a-table and write-a-document.

#### Scenario: Assistant's tools
- **WHEN** Assistant answers
- **THEN** its model is offered read-a-file, read-a-component, save-a-file, show-a-table and
  write-a-document

#### Scenario: Scout's tools
- **WHEN** Explorer answers with *Scout*, which lists no tools
- **THEN** its model is offered only read-a-file and read-a-component
