# Spec Delta

## MODIFIED Requirements

### Requirement: What the model sees of the data
When a data Trait asks the AI model to choose checks, actions or keys, it SHALL send the
user's message, the outputs of the run's earlier Steps labelled with their names, and a
description of each table: its file name, row count, and for each
column the name, type, count of missing values, count of distinct values, and the minimum
and maximum when the column is numeric or a date. For a column with at most 30 distinct
values, the description also lists up to its 20 most frequent values with their counts. A
column whose name suggests personal data (for example name, phone, email, address, or
coordinates of homes), or whose values are mostly distinct, SHALL have no values listed.
Rows SHALL never be sent.

#### Scenario: Category values shared
- **WHEN** Curator cleans a table whose column `variety` has 6 distinct values
- **THEN** the model receives the 6 values of `variety` with their counts, and no row of
  the table

#### Scenario: Personal column not sampled
- **WHEN** a table has a column `farmer_name` with 8 distinct values
- **THEN** the description of `farmer_name` lists no values

#### Scenario: An earlier answer
- **WHEN** a *Plot* Step follows an approval whose written answer is "show yield by site"
- **THEN** *Plot*'s model receives that answer along with the user's message
