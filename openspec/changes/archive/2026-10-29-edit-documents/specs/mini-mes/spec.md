# Spec Delta

## MODIFIED Requirements

### Requirement: Trait library
The Rust core SHALL hold a shared Trait library. Each Trait definition SHALL have:
- an `id` (UUID, stable across installations);
- a `name` (imperative verb in Title Case) and a `description`;
- a `color`: one bright fill on which a black line glyph stays legible, as DESIGN.md
  describes for Trait icons;
- the `adapter` that runs it;
- its `instructions` (text, or none for adapters that take none);
- its `tools`: the tools it may use, possibly empty. A Trait whose adapter runs fixed code
  lists the tools that code uses; a prompt-based Trait lists the tools its model is offered
  besides the read tools, which every prompt-based Trait gets.

What a Trait can read, save or show comes only from its tools; a definition lists no
Interactive Component kinds. The library SHALL refuse to load with a tool name it does not
know, or with a prompt-based Trait listing a tool that has no form for models.

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
- **THEN** *Assist* lists `save_file`, `show_table`, `write_document`, `suggest_edit` and
  `edit_document`; *Summarize* `write_document`, `suggest_edit` and `edit_document`;
  *Find Papers* `show_papers`; *Theorize* `show_theories` and `save_file`; *Profile Data*
  `read_table` and `show_table`; *Validate Data*, *Clean Data* and *Join Data* `read_table`,
  `show_table` and `save_file`; *Plot* `read_table` and `show_chart`; and every other Trait
  lists none

#### Scenario: User-made Traits join the library
- **WHEN** the app starts and `user-library.json` holds a valid Trait *Translate*
- **THEN** the library contains *Translate* next to the built-in Traits, marked as
  user-made
