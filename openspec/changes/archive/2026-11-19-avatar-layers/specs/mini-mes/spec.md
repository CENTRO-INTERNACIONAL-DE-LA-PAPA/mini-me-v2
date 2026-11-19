# Spec Delta

## MODIFIED Requirements

### Requirement: Mini-Me definitions
Each Mini-Me SHALL have:
- an `id` (UUID, stable across installations);
- a `name` and a `description`;
- colours `tint`, `solid` and `ink`;
- an avatar: one part per avatar layer, by layer name: a `base`, `eyes` and a `mouth`, and
  optionally an `accessory` and a `held` item, each the id of one of the UI's avatar part
  files for that layer;
- a `group`, one of `thinking`, `literature` and `data`, which the `@` list shows it under;
- exactly one Workflow, a list of Steps as Workflows define them.

A Mini-Me's Traits are the Traits its Trait Steps reference. The predefined Mini-Mes are
built-in and read-only. User-made Mini-Mes are created, edited and deleted as the Library
editors describe. The list of Mini-Mes the UI gets SHALL say for each whether it is built-in.

#### Scenario: One-Step Workflow
- **WHEN** a Mini-Me whose Workflow has one Trait Step answers a message
- **THEN** that Step's Trait is the one called

#### Scenario: Multi-Step Workflow
- **WHEN** Investigator answers a message
- **THEN** its reply is produced by running each Step of its Workflow

#### Scenario: Unknown group
- **WHEN** the built-in library names a Mini-Me with a `group` other than `thinking`,
  `literature` or `data`, or with none
- **THEN** the library fails to load, naming that Mini-Me; a user-made Mini-Me with such a
  group is skipped instead

#### Scenario: User-made Mini-Me is listed
- **WHEN** the user has saved "Field Translator"
- **THEN** the UI's list of Mini-Mes includes it after the built-in ones, marked as not
  built-in

## ADDED Requirements

### Requirement: Avatars are drawn from layers
The UI SHALL draw an avatar by stacking its parts in layer order: Base, Eyes, Mouth, Accessory,
Held item. Each part SHALL be an SVG file in its layer's folder, used as exported: its body
and freckle placeholder colours SHALL take the Mini-Me's `solid` and `ink`. A layer without
parts SHALL NOT be offered, and an unknown part id SHALL draw nothing for its layer.

#### Scenario: Built-in Mini-Mes look as before
- **WHEN** the app shows Scribe
- **THEN** Scribe has the long base, round open eyes, no visible mouth and a bow tie, in
  Scribe's colours

#### Scenario: A new part
- **WHEN** a developer adds an exported SVG to the accessories folder
- **THEN** the next build offers it as an accessory, coloured and animated like the others

#### Scenario: Held item without parts
- **WHEN** the Held item folder is empty
- **THEN** no Held item is offered when picking a Mini-Me's avatar
