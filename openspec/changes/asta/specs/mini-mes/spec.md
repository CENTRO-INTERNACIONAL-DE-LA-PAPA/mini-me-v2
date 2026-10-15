# Spec Delta

## MODIFIED Requirements

### Requirement: Trait library
The Rust core SHALL hold a shared Trait library. Each Trait definition SHALL have:
- an `id` (UUID, stable across installations);
- a `name` (imperative verb in Title Case) and a `description`;
- a `color` (one mid-tone solid);
- the `adapter` that runs it;
- its `instructions` (text, or none for adapters that take none).

The library is read-only in this version and contains *Summarize*, *Assist*, *Find Papers*
and *Theorize*.

#### Scenario: Built-in Traits
- **WHEN** the app starts
- **THEN** the library contains *Summarize* and *Assist* (adapter `prompt`), *Find Papers*
  (adapter `asta-paper-finder`) and *Theorize* (adapter `asta-theorizer`)

### Requirement: Predefined Mini-Mes
Mini-Me SHALL ship with four Mini-Mes:
- **Scribe:** "Summarizes your messages and the files you reference"; one Step running
  *Summarize*.
- **Assistant:** "Answers general questions and requests that no other Mini-Me specializes
  in"; one Step running *Assist*, whose instructions make it a general research assistant
  that uses referenced files when relevant and says when it does not know.
- **Researcher:** "Finds research papers on a topic with Ai2's Paper Finder"; one Step
  running *Find Papers*.
- **Theorist:** "Builds scientific theories from the literature with Ai2's Theorizer"; one
  Step running *Theorize*.

Their colours follow DESIGN.md's Mini-Me colour family.

#### Scenario: Mini-Mes available
- **WHEN** the user types `@` in the composer
- **THEN** Scribe, Assistant, Researcher and Theorist are offered

#### Scenario: General question
- **WHEN** the user sends "@Assistant what is late blight?"
- **THEN** Assistant answers with an explanation from the AI model chosen in Settings
