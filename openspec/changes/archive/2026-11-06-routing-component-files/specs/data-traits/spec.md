# Spec Delta

## ADDED Requirements

### Requirement: A chart records its file
Each chart Plot draws from a table file SHALL record that file in its data, as `source` (its
name) and `source_id` (its Asset ID), as a table shown from a file does. A chart drawn from a
table with no file behind it SHALL record neither. The record SHALL hold no rows.

#### Scenario: Drawn from a file
- **WHEN** Plot draws "Yield by variety" from `field-trial.csv`
- **THEN** the chart's data holds `source` `field-trial.csv` and that file's Asset ID as
  `source_id`

#### Scenario: Drawn from a referenced table
- **WHEN** Plot draws from `$Field-trial`, a table shown from `field-trial.csv`
- **THEN** the chart records `field-trial.csv`, the file behind that table
