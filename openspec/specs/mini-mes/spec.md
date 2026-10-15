# mini-mes Specification

## Purpose

Defines the shared Trait library and the Mini-Mes built from it: what a Trait and a Mini-Me
definition hold, which ones Mini-Me ships with, and how the UI lists and shows them.

## Requirements

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

### Requirement: Mini-Me definitions
Each Mini-Me SHALL have:
- an `id` (UUID, stable across installations);
- a `name` and a `description`;
- colours `tint`, `solid` and `ink`;
- exactly one Workflow.

In this version every Workflow has exactly one Trait Step, which references a Trait in the
library by ID. Mini-Mes are read-only in this version.

#### Scenario: One-Step Workflow
- **WHEN** a Mini-Me answers a message
- **THEN** its single Step's Trait is the one called

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

### Requirement: A Mini-Me is shown by name and colour
The UI SHALL get the list of Mini-Mes (ID, name, description, colours) from the Rust core.
It SHALL show each reply authored by a Mini-Me with that Mini-Me's name and a mark in its
`solid` colour. It SHALL show each `@` mention as a chip in the Mini-Me's `tint` with
`ink` text. A reply whose Mini-Me is unknown SHALL show "Mini-Me" with a neutral mark.

#### Scenario: Reply header
- **WHEN** Scribe answers
- **THEN** the reply's header reads "Scribe" next to a mark in Scribe's solid colour

#### Scenario: Unknown Mini-Me
- **WHEN** a Conversation holds a reply from a Mini-Me that no longer exists
- **THEN** the reply is shown as "Mini-Me" with a neutral mark and its text intact
