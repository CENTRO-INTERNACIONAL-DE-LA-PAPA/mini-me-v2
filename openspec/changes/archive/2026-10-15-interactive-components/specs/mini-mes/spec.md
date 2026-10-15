# Spec Delta

## MODIFIED Requirements

### Requirement: Trait library
The Rust core SHALL hold a shared Trait library. Each Trait definition SHALL have:
- an `id` (UUID, stable across installations);
- a `name` (imperative verb in Title Case) and a `description`;
- a `color` (one mid-tone solid);
- the `adapter` that runs it;
- its `instructions` (text, or none for adapters that take none);
- its `components`: the Interactive Component kinds its answers may include, possibly
  empty. Only built-in Traits SHALL list any.

The library is read-only in this version and contains *Summarize*, *Assist*, *Find Papers*
and *Theorize*.

#### Scenario: Built-in Traits
- **WHEN** the app starts
- **THEN** the library contains *Summarize* and *Assist* (adapter `prompt`), *Find Papers*
  (adapter `asta-paper-finder`) and *Theorize* (adapter `asta-theorizer`)

#### Scenario: Components of the built-in Traits
- **WHEN** the app starts
- **THEN** *Find Papers* lists `paper-sources`, *Theorize* lists `theories`, and
  *Summarize* and *Assist* list none
