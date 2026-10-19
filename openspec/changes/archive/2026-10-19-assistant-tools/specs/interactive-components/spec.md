# Spec Delta

## MODIFIED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component data SHALL come only
from a Trait's adapter through the kind's show tool, or, for the `approval` kind, from the
Rust core. Adding a kind SHALL NOT need a change to the event protocol, the link protocol or
the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1, `approval` version 1 and `chart` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind that a show tool adds has a renderer for version 1

#### Scenario: No Trait adds an approval
- **WHEN** a Trait call sends `component.add` with kind `approval`
- **THEN** the request fails with `component_not_allowed`

## ADDED Requirements

### Requirement: Checks on an added component
The core SHALL reject `component.add` from a Trait call with:
- `component_not_allowed` when the kind is `approval`, which only the core creates;
- `invalid_component` when `text` is empty or `data` serialized is larger than 2 MiB.

The core SHALL NOT check the kind against the Trait. A rejected component SHALL NOT be
persisted, and the call SHALL continue.

#### Scenario: Any kind from a Trait
- **WHEN** a Find Papers call adds a `theories` component
- **THEN** the core accepts it; which kinds a Trait shows is up to its adapter's tools

#### Scenario: Empty text
- **WHEN** a Find Papers call adds `paper-sources` with an empty `text`
- **THEN** the request fails with `invalid_component`, and nothing is persisted

## REMOVED Requirements

### Requirement: Only listed kinds are accepted
**Reason**: Trait definitions no longer list component kinds; a Trait's kinds come from the
show tools its adapter uses.
**Migration**: Replaced by "Checks on an added component". Remove `components` from Trait
definitions; the core refuses only `approval` from Traits.
