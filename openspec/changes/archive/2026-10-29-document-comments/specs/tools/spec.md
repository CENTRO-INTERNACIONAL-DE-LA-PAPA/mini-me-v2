# Spec Delta

## ADDED Requirements

### Requirement: Suggesting an edit
The suggest-an-edit tool (`suggest_edit`, with a form for models) SHALL take the replacement
`text` for the passage of the comment thread the call answers, at most 64 KiB, and add a
`suggestion` component to the reply. The Rust core SHALL complete the component with the
document and the passage's text as it is when the suggestion is made. Outside a comment thread
the tool SHALL fail with `not_in_thread`. A tool result SHALL give the new component's ID. The
tool SHALL NOT change the document; only the user's Accept does.

#### Scenario: Scribe suggests a shorter passage
- **WHEN** Scribe, answering "@Scribe make this shorter", calls suggest-an-edit with "Yield fell
  above 3,800 m."
- **THEN** a suggestion with that text, based on the passage as it read then, is added to
  Scribe's reply, and the document is unchanged

#### Scenario: Outside a thread
- **WHEN** a Trait call in a Conversation calls suggest-an-edit
- **THEN** the call fails with `not_in_thread` and no component is added
