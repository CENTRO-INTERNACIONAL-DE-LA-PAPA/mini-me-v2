## MODIFIED Requirements

### Requirement: What the Outline lists
A Conversation SHALL offer an Outline panel with three groups, each in order of first
appearance: Mini-Mes (each one @-mentioned in a message or that wrote a reply), Files (each
Asset that is not hidden, attached to a message or referenced with `#`), and Tables and charts
(each `table` or `chart` Interactive Component, by its title, or by its source file's name
when it has no title, or "Table" or "Chart" when it has neither). An entry SHALL appear once,
with how many messages it appears in. Groups with no entries SHALL be left out.

#### Scenario: A Conversation with a cleaned table
- **WHEN** the user attaches `field-trial.csv` and asks @Curator to clean it, and Curator's
  reply shows an untitled preview of `field-trial-cleaned.csv`
- **THEN** the Outline lists Curator under Mini-Mes, `field-trial.csv` and
  `field-trial-cleaned.csv` under Files, and `field-trial-cleaned.csv` under Tables and charts

#### Scenario: Mentioned in several messages
- **WHEN** `field-trial.csv` is attached to one message and referenced with `#` in two later
  ones
- **THEN** it is listed once under Files, appearing in 3 messages

#### Scenario: Chart by its title
- **WHEN** Plotter's reply shows the chart "Yield by variety"
- **THEN** the Outline lists "Yield by variety" under Tables and charts

#### Scenario: Empty Conversation
- **WHEN** the Conversation has no messages
- **THEN** the Outline says nothing has been used yet
