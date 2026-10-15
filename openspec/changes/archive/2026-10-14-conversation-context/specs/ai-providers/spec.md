# Spec Delta

## ADDED Requirements

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
