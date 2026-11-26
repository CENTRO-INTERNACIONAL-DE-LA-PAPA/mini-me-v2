# Spec Delta

## ADDED Requirements

### Requirement: Diagnostic Traits choose the roles of columns
*Compare Groups*, *Find Drivers*, *Check Confounders* and *Analyze Trends* SHALL have the model
choose, from the message and the earlier Steps' outputs, the column for each role the Trait
needs and its options. A role filled with a column the table does not have, or of a type the
role does not take, SHALL fail the reply with a message naming the column and the role. Each
needs an AI model.

#### Scenario: Roles from a written answer
- **WHEN** an earlier approval's answer says "the outcome is yield_t_ha, compare by site"
- **THEN** *Compare Groups* compares `yield_t_ha` between the values of `site`

#### Scenario: Text column as an outcome
- **WHEN** the model names `variety`, a text column, as *Find Drivers*' outcome
- **THEN** the reply fails, saying `variety` is a text column and the outcome needs numbers

### Requirement: Diagnostic Traits speak of associations
The replies of *Compare Groups*, *Find Drivers*, *Check Confounders* and *Analyze Trends* SHALL
describe what they find as differences, associations and changes, never as causes, and SHALL
say once that the analysis shows association, not cause, also when the user asks for causes.

#### Scenario: Asked for a cause
- **WHEN** the user asks "does irrigation cause higher yield?"
- **THEN** the reply reports how yield differs with irrigation and says the analysis shows an
  association, not a cause

### Requirement: Compare Groups Trait
The Trait library SHALL contain *Compare Groups*, which compares a number column (the value)
between the groups of a text, boolean or number column (the groups), at most 20 groups with at
least 2 values each. For each group it SHALL give the count and mean, and, for each group but
the reference (the one the message names, else the largest), the difference of means from the
reference with a 95% bootstrap confidence interval and a Welch t-test p-value.

#### Scenario: Yield by site
- **WHEN** the message asks how yield differs between Huancayo, Cusco and La Molina, naming
  Huancayo as the reference
- **THEN** the reply gives each site's count and mean yield, and Cusco's and La Molina's
  differences from Huancayo with their intervals and p-values

#### Scenario: Too many groups
- **WHEN** the groups column has 45 distinct values
- **THEN** the reply fails, saying at most 20 groups can be compared

### Requirement: Compare Groups replies
*Compare Groups*' reply SHALL name the largest difference with its interval, show a `table`
component with one row per group, an estimation chart of each difference and its interval, and
a box plot of the value by group.

#### Scenario: Charts of a comparison
- **WHEN** *Compare Groups* compares three sites
- **THEN** the reply holds a `table` of the three sites, an estimation chart of two
  differences, and a box plot of the value by site

### Requirement: Find Drivers Trait
The Trait library SHALL contain *Find Drivers*, which fits a linear regression of a number
column (the outcome) on the chosen drivers, number, text or boolean, a text or boolean driver
entering as one term per value other than its first. It SHALL give each term's coefficient,
95% confidence interval and p-value, each driver's variance inflation factor, the R², and the
number of rows used. Rows missing a value in the outcome or a driver are left out.

#### Scenario: Yield on rainfall and variety
- **WHEN** *Find Drivers* regresses `yield_t_ha` on `rainfall_mm` and `variety`
- **THEN** the reply gives a term for `rainfall_mm` and one per variety but the first, each with
  its coefficient, interval and p-value, plus each driver's VIF and the R²

#### Scenario: More terms than rows
- **WHEN** the terms outnumber the rows that have every value
- **THEN** the reply fails, saying there are too few complete rows for that many drivers

### Requirement: Find Drivers replies
*Find Drivers*' reply SHALL name the terms whose interval excludes zero, flag drivers with a VIF
above 5 as hard to tell apart, say how many rows were left out, and show a `table` component of
the terms and a chart of each coefficient with its interval.

#### Scenario: Collinear drivers
- **WHEN** `altitude_m` and `mean_temp_c` have VIFs of 12 and 11
- **THEN** the reply says those two drivers are hard to tell apart

### Requirement: Check Confounders Trait
The Trait library SHALL contain *Check Confounders*, which estimates the coefficient of one
number or boolean driver (the focus) on a number outcome, alone and with the chosen controls,
and, when a subgroup column is chosen, within each of its values with at least 10 rows, at most
10 subgroups. It SHALL give each estimate with its 95% confidence interval and the rows used,
and how much the estimate changed with the controls, in percent.

#### Scenario: Rainfall with altitude as control
- **WHEN** *Check Confounders* estimates rainfall's coefficient on yield alone and with
  `altitude_m` as a control
- **THEN** the reply gives both estimates with their intervals and the change between them

### Requirement: Check Confounders replies
*Check Confounders*' reply SHALL say whether the focus's estimate held, shrank, grew or changed
sign with the controls (held meaning it moved by less than 10%), and show a `table` component
of the estimates and a chart of each estimate with its interval.

#### Scenario: Estimate shrinks
- **WHEN** the focus's estimate falls from 0.04 to 0.01 with the controls
- **THEN** the reply says the estimate shrank by 75% once the controls were included

### Requirement: Analyze Trends Trait
The Trait library SHALL contain *Analyze Trends*, which fits a linear trend of a number column
over a date or number column (the time), per year for dates, with its 95% confidence interval
and p-value, overall and for each value of an optional group column, at most 10 groups. When
the model gives a change date from the message, it SHALL also compare the mean before and after
it, as a difference with a 95% bootstrap interval and a Welch t-test p-value.

#### Scenario: Yield over the seasons
- **WHEN** *Analyze Trends* looks at `yield_t_ha` over `planting_date`
- **THEN** the reply gives the change in yield per year with its interval and p-value

#### Scenario: Before and after a date
- **WHEN** the message asks what changed after 2024-10-01
- **THEN** the reply also gives the mean yield before and after that date and the difference
  with its interval

### Requirement: Analyze Trends replies
*Analyze Trends*' reply SHALL show a `table` component of the trends, and of the before-and-after
comparison when there is one, and a line chart of the value's mean over time, one line per group.

#### Scenario: Trend by site
- **WHEN** *Analyze Trends* looks at yield over time by `site`
- **THEN** the table has one trend per site and one overall, and the line chart one line per site

### Requirement: Templates for the Traits' own charts
A chart template MAY be marked for the data Traits' own charts. Such a template SHALL NOT be
offered to *Plot*'s model, and *Plot* SHALL ignore it when the model names it anyway. The app
SHALL ship one, for estimates with their intervals: a dot at each estimate and a line from its
lower to its upper bound, one row per category.

#### Scenario: Not offered to Plot
- **WHEN** *Plot* asks the model for a chart
- **THEN** the templates it lists leave out the estimates template

## MODIFIED Requirements

### Requirement: Exploring Traits draw from the chart templates
The charts of *Describe Variables*, *Find Correlations*, *Detect Outliers*, *Find Clusters*,
*Compare Groups*, *Find Drivers*, *Check Confounders* and *Analyze Trends* SHALL be drawn from the built-in chart templates, with their data computed as *Plot*'s are,
including leaving out rows with missing values and sampling only to fit the size limit. Each
SHALL record the table file it was drawn from as *Plot*'s charts do.

#### Scenario: Histogram from a template
- **WHEN** *Describe Variables* draws the distribution of `yield` from `field-trial.csv`
- **THEN** the reply holds a `chart` component drawn from the histogram template whose
  source is `field-trial.csv`
