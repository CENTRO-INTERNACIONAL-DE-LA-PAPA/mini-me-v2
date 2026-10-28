# Spec Delta

## MODIFIED Requirements

### Requirement: Editing a user-made Mini-Me
The Mini-Me editor SHALL show three tabs: Workflow, Traits (with how many Traits the
Workflow runs) and Appearance. The Appearance tab SHALL let the user set the name, the
description and the group (`thinking`, `literature` or `data`), and pick the avatar's base,
face and optional accessory from the avatar parts, showing a live preview. The description
SHALL be required, because routing uses it to choose a Mini-Me. The Traits tab SHALL list
the Traits the Workflow runs, each opening its Trait editor. Save SHALL save every tab.

#### Scenario: New Mini-Me
- **WHEN** the user creates "Field Translator" in the Thinking group with a base, a face, no
  accessory and a description, and saves
- **THEN** "Field Translator" is listed under Thinking in the `@` list with that avatar

#### Scenario: Traits tab
- **WHEN** the user opens Investigator's Traits tab
- **THEN** it reads "Traits · 5" and lists *Scout*, *Wonder*, *Plan*, *Refute* and
  *Experiment*, each opening its Trait editor

## REMOVED Requirements

### Requirement: A user-made Mini-Me's Workflow is a list of Trait Steps
**Reason**: The Workflow tab's canvas edits every kind of Step, Trait Steps included.
**Migration**: Workflows are stored as before. Trait Steps are added, moved and removed on
the canvas, as the workflow-editor capability describes.

### Requirement: Workflows with control Steps are locked
**Reason**: The canvas edits control Steps, so no Workflow needs to be locked.
**Migration**: Duplicates with control Steps, such as a copy of Investigator, become editable
on the canvas. Their saved Workflows are unchanged.
