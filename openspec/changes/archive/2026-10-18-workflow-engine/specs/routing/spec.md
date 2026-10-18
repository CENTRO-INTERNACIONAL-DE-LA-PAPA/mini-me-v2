# Spec Delta

## MODIFIED Requirements

### Requirement: Context answer is passed on
Jev's `needs_context` answer SHALL be passed to the reply's run as `context.needs_context`,
and from there to each of its Trait calls: `true`, `false`, or `null` when no decision is
available. Adapters MAY ignore it.

#### Scenario: Passed to the call
- **WHEN** Jev answers `needs_context` with `yes`
- **THEN** the reply's `run.start` carries `context.needs_context: true`
