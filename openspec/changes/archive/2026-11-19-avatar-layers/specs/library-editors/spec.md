# Spec Delta

## MODIFIED Requirements

### Requirement: Editing a user-made Mini-Me
The Mini-Me editor SHALL show three tabs: Workflow, Traits (with how many Traits the
Workflow runs) and Appearance. The Appearance tab SHALL let the user set the name, the
description and the group (`thinking`, `literature` or `data`), and pick one part for each
avatar layer that has parts (none allowed for the optional ones), showing a live preview. The
description SHALL be required, because routing uses it to choose a Mini-Me. The Traits tab
SHALL list the Traits the Workflow runs, each opening its Trait editor. Save SHALL save every
tab.

#### Scenario: New Mini-Me
- **WHEN** the user creates "Field Translator" in the Thinking group with a base, eyes, a
  mouth, no accessory and a description, and saves
- **THEN** "Field Translator" is listed under Thinking in the `@` list with that avatar

#### Scenario: Traits tab
- **WHEN** the user opens Investigator's Traits tab
- **THEN** it reads "Traits 5" and lists *Scout*, *Wonder*, *Plan*, *Refute* and
  *Experiment*, each opening its Trait editor
