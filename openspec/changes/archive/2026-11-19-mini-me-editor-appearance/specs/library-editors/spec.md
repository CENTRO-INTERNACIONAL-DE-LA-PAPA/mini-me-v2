# Spec Delta

## MODIFIED Requirements

### Requirement: Editing a user-made Mini-Me
The Mini-Me editor SHALL show three tabs, in this order: Appearance, Workflow and Traits (with
how many Traits the Workflow runs), and SHALL open on Appearance. The Appearance tab SHALL let
the user set the name, the description and the group (`thinking`, `literature` or `data`), and
pick one part for each avatar layer that has parts (none allowed for the optional ones),
showing a live preview. The description SHALL be required, because routing uses it to choose a
Mini-Me. The Traits tab SHALL list the Traits the Workflow runs, each opening its Trait editor.
Save SHALL save every tab.

#### Scenario: New Mini-Me
- **WHEN** the user creates "Field Translator" in the Thinking group with a base, eyes, a
  mouth, no accessory and a description, and saves
- **THEN** "Field Translator" is listed under Thinking in the `@` list with that avatar

#### Scenario: Traits tab
- **WHEN** the user opens Investigator's Traits tab
- **THEN** it reads "Traits 5" and lists *Scout*, *Wonder*, *Plan*, *Refute* and
  *Experiment*, each opening its Trait editor

#### Scenario: Opening the editor
- **WHEN** the user opens Skeptic or starts a new Mini-Me
- **THEN** the editor shows the Appearance tab, first in the row

### Requirement: Picking a Mini-Me's colour
The Mini-Me editor SHALL offer sixteen colour families as swatches, ordered by hue, and a hue
slider. The chosen hue SHALL set the Mini-Me's `solid` and `ink` as the avatar palette does,
and its `tint` as the tint of the same hue (oklch lightness 0.94, chroma 0.04). A family with
fixed `solid` and `ink` values SHALL keep them.

#### Scenario: Custom hue
- **WHEN** the user moves the hue slider to 120 and saves
- **THEN** the Mini-Me's `tint`, `solid` and `ink` are the oklch colours of hue 120, and its
  pill and avatar use them

#### Scenario: Colour family
- **WHEN** the user picks the Purple swatch
- **THEN** the `solid` is `#6E5BFF` and the `ink` is `#4A3AE0`

## ADDED Requirements

### Requirement: A random look
The Appearance tab of a user-made Mini-Me SHALL offer a Random button, marked with a dice,
that picks a random part for each avatar layer that has parts (sometimes none for an optional
layer) and a random colour family. It SHALL NOT change the name, description or group.

#### Scenario: Rolling the dice
- **WHEN** the user presses Random while creating "Field Translator"
- **THEN** the preview shows a new avatar in a colour family, and the name, description and
  group are unchanged
