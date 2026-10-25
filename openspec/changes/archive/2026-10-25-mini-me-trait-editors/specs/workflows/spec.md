# Spec Delta

## MODIFIED Requirements

### Requirement: Workflows are checked when the library loads
The Rust core SHALL refuse a library whose Workflows break a rule:
- Step IDs are not unique, or a Trait ID is missing from the library or is a placeholder;
- a list of Steps is empty, or a Workflow has no Trait Step;
- a condition or parallel Step has fewer than two branches, or two with the same label;
- `max_iterations` is not from 1 to 10;
- a question, prompt or label is empty.

For the built-in library, refusing means the app does not start. For a user-made Mini-Me,
refusing means that Mini-Me is skipped when the library loads, and a save of it is refused.

#### Scenario: Unknown Trait in a nested Step
- **WHEN** a Trait Step inside a parallel branch references a Trait ID that is not in the
  library
- **THEN** the library is refused, naming the Mini-Me and the Step ID

#### Scenario: Loop without a limit
- **WHEN** a loop Step has `max_iterations` 0
- **THEN** the library is refused

#### Scenario: Broken user-made Workflow
- **WHEN** `user-library.json` holds a Mini-Me whose Workflow has no Steps
- **THEN** the app starts without that Mini-Me, and the Library view names it with the
  problem
