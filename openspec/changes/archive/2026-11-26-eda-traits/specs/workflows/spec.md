# Spec Delta

## MODIFIED Requirements

### Requirement: Workflows are checked when the library loads
The Rust core SHALL refuse a library whose Workflows break a rule:
- Step IDs are not unique, or a Trait ID is missing from the library or is a placeholder;
- a Workflow's or loop's list of Steps is empty, or a Workflow has no Trait Step (a branch of
  a condition or parallel Step may have no Steps);
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
- **WHEN** `library.json` holds a Mini-Me whose Workflow has no Steps
- **THEN** the app starts without that Mini-Me, and the Library view names it with the
  problem

#### Scenario: Condition with an empty branch
- **WHEN** a condition Step has the branches "cluster", running *Find Clusters*, and "skip",
  with no Steps
- **THEN** the library is accepted

#### Scenario: Parallel Step with an empty branch
- **WHEN** a parallel Step has the branches "A", running *Scout*, and "B", with no Steps
- **THEN** the library is accepted, and the parallel Step's output is *Scout*'s under
  "## A"

### Requirement: Step outputs
Each Step SHALL have an output, used by later Steps and by the reply:
- a Trait Step's output is the text its call wrote;
- a condition's output is that of the last Step with an output in the chosen branch, and
  none when that branch has no Steps;
- a loop's output is that of its last iteration;
- a parallel Step's output is each branch's output under a `## <label>` line, in branch
  order;
- an approval has no output.

#### Scenario: Parallel output
- **WHEN** a parallel Step's branches "Directions" and "Questions" end with outputs A and B
- **THEN** the parallel Step's output is "## Directions", A, "## Questions" and B, in that
  order

#### Scenario: Empty branch chosen
- **WHEN** a condition's model picks the "skip" branch, which has no Steps
- **THEN** the condition has no output, the run goes on with the Step after the condition, and
  the reply's text is the output of the last top-level Step before it that has one
