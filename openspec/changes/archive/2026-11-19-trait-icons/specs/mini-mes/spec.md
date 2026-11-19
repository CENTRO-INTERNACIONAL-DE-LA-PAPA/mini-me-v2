# Spec Delta

## MODIFIED Requirements

### Requirement: Trait library
The Rust core SHALL hold a shared Trait library. Each Trait definition SHALL have:
- an `id` (UUID, stable across installations);
- a `name` (imperative verb in Title Case) and a `description`;
- a `color`: one bright fill on which a black line glyph stays legible, as DESIGN.md
  describes for Trait icons;
- optionally an `icon`: the name of one of the UI's Trait icons;
- the `adapter` that runs it;
- its `instructions` (text, or none for adapters that take none).

A definition lists no tools and no Interactive Component kinds: a prompt-based Trait's model is
offered every tool, and an adapter that runs fixed code uses the tools its code calls.

The library holds built-in Traits, which are read-only, and user-made Traits, which the user
creates, edits and deletes as the Library editors describe. The built-in Traits are
*Summarize*, *Assist*, *Find Papers*, *Theorize*, *Scout*, *Refute*, *Plan*, *Wonder*,
*Experiment*, *Profile Data*, *Validate Data*, *Clean Data*, *Join Data* and *Plot*, and the
placeholder Traits.

#### Scenario: Built-in Traits
- **WHEN** the app starts
- **THEN** the library contains *Summarize*, *Assist*, *Scout*, *Refute*, *Plan*,
  *Wonder* and *Experiment* (adapter `prompt`), *Find Papers* (adapter
  `asta-paper-finder`), *Theorize* (adapter `asta-theorizer`), *Profile Data* (adapter
  `data-profile`), *Validate Data* (adapter `data-validate`), *Clean Data* (adapter
  `data-clean`), *Join Data* (adapter `data-join`), *Plot* (adapter `data-plot`), and the
  placeholder Traits (adapter `echo`)

#### Scenario: Components of the built-in Traits
- **WHEN** the app starts
- **THEN** no built-in Trait definition holds a list of tools or component kinds

#### Scenario: User-made Traits join the library
- **WHEN** the app starts and `library.json` holds a valid Trait *Translate*
- **THEN** the library contains *Translate* next to the built-in Traits, marked as
  user-made

## ADDED Requirements

### Requirement: A Trait is shown by its icon
Every built-in Trait SHALL carry an icon. Wherever the UI shows a Trait (the Library's Traits
list, a Mini-Me's Traits, the Trait editor's header and the Workflow editor's Trait Steps) it
SHALL show the Trait's icon as a plain line icon in ink, never on a filled or tinted tile. A
Trait without an icon, or whose icon the UI does not know, SHALL show the puzzle piece.

#### Scenario: Built-in Traits differ
- **WHEN** the user opens the Library's Traits section
- **THEN** *Summarize* and *Plot* each show their own icon, and neither shows the puzzle piece

#### Scenario: Trait Step
- **WHEN** a Workflow runs *Plot*
- **THEN** its node shows *Plot*'s icon

#### Scenario: Unknown icon
- **WHEN** `library.json` holds a Trait whose icon is not one the UI knows
- **THEN** the Trait is listed and shows the puzzle piece
