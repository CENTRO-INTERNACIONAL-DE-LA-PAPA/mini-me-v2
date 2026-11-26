# Spec Delta

## MODIFIED Requirements

### Requirement: The inspector edits a Trait Step
Selecting a Trait Step SHALL show in the inspector:
- its Trait, which the user can change;
- the Trait's description;
- how many Mini-Mes use the Trait, with a link to its Trait editor;
- an "Ask before running" toggle;
- a "Show its results in the reply" toggle, which sets `show_results`;
- Remove step.

#### Scenario: Changing the Trait
- **WHEN** the user selects a *Scout* Step and picks *Wonder* in the inspector
- **THEN** the Step runs *Wonder*

#### Scenario: Showing a Step's results
- **WHEN** the user turns on "Show its results in the reply" for a *Plot* Step
- **THEN** the Step is saved with `show_results` `true`
