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
- its `instructions` (text, or none for adapters that take none).

The library is read-only in this version and contains *Summarize* and *Echo*.

#### Scenario: Built-in Traits
- **WHEN** the app starts
- **THEN** the library contains *Summarize* (adapter `prompt`) and *Echo* (adapter `echo`)

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
Mini-Me SHALL ship with two Mini-Mes:
- **Scribe:** "Summarizes your messages and the files you reference"; one Step running
  *Summarize*.
- **Echo:** "Repeats your message back to you"; one Step running *Echo*.

Their colours follow DESIGN.md's Mini-Me colour family.

#### Scenario: Mini-Mes available
- **WHEN** the user types `@` in the composer
- **THEN** Scribe and Echo are offered

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
