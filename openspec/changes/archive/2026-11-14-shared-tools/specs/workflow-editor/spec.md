## MODIFIED Requirements

### Requirement: Nodes show what their Step does
A Trait Step's node SHALL show its Trait's name. An approval's node SHALL show its prompt. A
marker or loop pill SHALL show the Step's label. Without a label, a condition shows its question,
a parallel split "In parallel", and a loop its limit.

#### Scenario: Trait node
- **WHEN** a Workflow runs *Assist*
- **THEN** its node reads "Assist", with no count of tools

### Requirement: The inspector edits a Trait Step
Selecting a Trait Step SHALL show in the inspector:
- its Trait, which the user can change;
- the Trait's description;
- how many Mini-Mes use the Trait, with a link to its Trait editor;
- an "Ask before running" toggle;
- Remove step.

#### Scenario: Changing the Trait
- **WHEN** the user selects a *Scout* Step and picks *Wonder* in the inspector
- **THEN** the Step runs *Wonder*
