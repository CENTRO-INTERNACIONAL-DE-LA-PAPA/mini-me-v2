# Spec Delta

## ADDED Requirements

### Requirement: Picking a Trait's icon
In the editor of a user-made Trait, the icon in the header SHALL open a grid of the UI's Trait
icons; picking one SHALL set the Trait's icon, which is saved with the Trait. A new Trait SHALL
start without an icon, and the grid SHALL offer the puzzle piece to remove it. The editor of a
built-in Trait SHALL show its icon without offering the grid. A copy made with Duplicate SHALL
start with the original's icon.

#### Scenario: Picking an icon
- **WHEN** the user opens *Translate*, picks an icon from the grid and saves
- **THEN** *Translate* shows that icon in the Library, and still does after the app restarts

#### Scenario: Back to the puzzle piece
- **WHEN** the user picks the puzzle piece in *Translate*'s grid and saves
- **THEN** *Translate* has no icon and shows the puzzle piece

#### Scenario: Built-in Trait
- **WHEN** the user opens *Plan*
- **THEN** its icon is shown and clicking it opens no grid

#### Scenario: Duplicated Trait
- **WHEN** the user duplicates *Plan* and saves
- **THEN** "Plan Copy" shows *Plan*'s icon
