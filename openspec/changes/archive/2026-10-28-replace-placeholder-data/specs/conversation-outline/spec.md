# Spec Delta

## Purpose

Gives a Conversation an Outline panel of the Mini-Mes, Assets and tables and charts it uses,
so the user can find where each one appears without scrolling through the whole Conversation.

## ADDED Requirements

### Requirement: What the Outline lists
A Conversation SHALL offer an Outline panel with three groups, each in order of first
appearance: Mini-Mes (each one @-mentioned in a message or that wrote a reply), Files (each
Asset attached to a message or referenced with `#`), and Tables and charts (each `table` or
`chart` Interactive Component, by its `$` name). An entry SHALL appear once, with how many
messages it appears in. Groups with no entries SHALL be left out.

#### Scenario: A Conversation with a cleaned table
- **WHEN** the user attaches `field-trial.csv` and asks @Curator to clean it, and Curator's
  reply shows a table named `field-trial-cleaned`
- **THEN** the Outline lists Curator under Mini-Mes, `field-trial.csv` under Files and
  `field-trial-cleaned` under Tables and charts

#### Scenario: Mentioned in several messages
- **WHEN** `field-trial.csv` is attached to one message and referenced with `#` in two later
  ones
- **THEN** it is listed once under Files, appearing in 3 messages

#### Scenario: Empty Conversation
- **WHEN** the Conversation has no messages
- **THEN** the Outline says nothing has been used yet

### Requirement: The Outline follows the Conversation
The Outline SHALL be derived from the Conversation's messages in the UI, store nothing, and
update as messages and Interactive Components arrive.

#### Scenario: A reply adds a chart
- **WHEN** the Outline is open and Plotter's reply shows a chart
- **THEN** the chart appears under Tables and charts without reopening the panel

### Requirement: Jumping to where an entry appears
Clicking an entry SHALL scroll the Conversation to the first message it appears in. Clicking
the same entry again SHALL scroll to the next such message, and after the last, back to the
first.

#### Scenario: Cycling through a file's messages
- **WHEN** the user clicks `field-trial.csv` three times
- **THEN** the Conversation scrolls to the message that attached it, then to each later
  message that references it

### Requirement: The Outline replaces the To-do panel
A Conversation SHALL offer the Outline, Jobs and Steps panels, and no To-do panel.

#### Scenario: Side panel buttons
- **WHEN** the user opens a Conversation
- **THEN** it offers Outline and Jobs, and no To-do
