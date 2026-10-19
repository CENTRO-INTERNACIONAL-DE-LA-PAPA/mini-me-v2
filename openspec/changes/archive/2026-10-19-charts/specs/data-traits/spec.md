# Spec Delta

## MODIFIED Requirements

### Requirement: The model only chooses from fixed lists
A data Trait SHALL ask the model for a structured answer naming entries of a fixed catalogue
of checks, actions or charts with their parameters, and SHALL ignore any entry that is not
in the catalogue, names a column the table does not have, or has invalid parameters, listing
what it ignored in the reply. The data Trait, not the model, SHALL compute every number,
check result, table and chart value it reports. When no AI model is set in Settings, a data
Trait that needs one fails with the message "Choose an AI model in Settings first."

#### Scenario: Invented check ignored
- **WHEN** the model's answer for Validate Data includes a check on a column `yeild` that
  the table does not have
- **THEN** that check is not run, and the reply lists it as ignored

#### Scenario: Invented chart ignored
- **WHEN** the model's answer for Plot includes a scatter chart of `yield` against a column
  `heigth` that the table does not have
- **THEN** that chart is not drawn, and the reply lists it as ignored

## ADDED Requirements

### Requirement: Plot Trait
The Trait library SHALL contain *Plot*, which draws charts of the first table it reads. The
model chooses the charts from the chart catalogue to match the user's message, and Plot
draws every valid one. It reads further tables only to say in the reply that they were not
used. Its reply is a short text and one `chart` component per chart, with no
`table` component.

#### Scenario: Yield distribution
- **WHEN** the user sends "@Plotter #field-trial.csv show me how yield is distributed"
- **THEN** the reply holds a `chart` component with a histogram of `yield` and no `table`
  component

#### Scenario: Several tables referenced
- **WHEN** the message references `harvest.csv` and `plots.csv`
- **THEN** Plot draws from `harvest.csv`, and the reply says `plots.csv` was not used

#### Scenario: No model set
- **WHEN** no AI model is set in Settings and the user asks Plotter for a chart
- **THEN** the reply fails with "Choose an AI model in Settings first."

### Requirement: Chart catalogue
Each chart the model chooses SHALL be one of these types, using columns of these types:
- histogram: `x` number or date;
- bar: `x` text or boolean, `y` number, aggregate count, sum, mean or median (count needs
  no `y`);
- line: `x` date or number, `y` number, aggregate for repeated `x` values;
- scatter: `x` and `y` number;
- box: `x` text or boolean groups, `y` number;
- heatmap: two or more number columns, as pairwise correlations.

#### Scenario: Wrong column type
- **WHEN** the model chooses a histogram of `variety`, a text column
- **THEN** that chart is ignored and listed in the reply with the reason

#### Scenario: Count of rows per category
- **WHEN** the model chooses a bar chart of `variety` with aggregate count
- **THEN** the chart shows the number of rows for each value of `variety`

### Requirement: Chart series
A histogram, bar, line or scatter chart SHALL accept an optional `series` column of type
text or boolean, which splits its values into one series per value of that column. Every
value SHALL be its own series, ordered from most to least frequent; values are never
grouped together.

#### Scenario: Yield by treatment
- **WHEN** the model chooses a line chart of `yield` over `date` with series `treatment`,
  which has 3 values
- **THEN** the chart has three series, one per treatment

#### Scenario: Many series
- **WHEN** the series column `site` has 30 values
- **THEN** the chart has 30 series, the most frequent site first

### Requirement: Alternative views
For each chart, the model's answer SHALL allow other chart types that suit the same
columns to be named as alternatives. Plot SHALL compute the data of every alternative that
is valid for those columns and include it in the chart as an extra view, once per type. It
SHALL drop invalid alternatives without listing them.

#### Scenario: Histogram with a box plot alternative
- **WHEN** the model chooses a histogram of `yield` with series `variety` and names box as
  an alternative
- **THEN** the chart has two views, the histogram first and a box plot of `yield` by
  `variety` second

### Requirement: What a chart's data holds
Plot SHALL compute only the values a chart type needs, with pandas: histogram bin edges and
counts, bar and line aggregates for every category or `x` value, box-plot quartiles,
whiskers and every outlier for every group, scatter and line points, or the Pearson
correlation of each pair of heatmap columns. Rows missing a value the chart uses SHALL be left out, and the reply SHALL
say how many were left out.

#### Scenario: Missing values left out
- **WHEN** a scatter chart of `yield` against `height` is drawn from a table where 12 rows
  have no `yield`
- **THEN** the chart leaves those rows out, and the reply says 12 rows had missing values

#### Scenario: Correlation heatmap
- **WHEN** the model chooses a heatmap of `yield`, `height` and `tubers`
- **THEN** the chart holds the nine pairwise correlations of those columns

### Requirement: Points are sampled only to fit the size limit
A line or scatter view SHALL hold every point while the chart's data fits the core's
component size limit. Only when it does not SHALL Plot draw a random sample, as large as
fits and the same each time it charts the same table, and the reply SHALL say how many
points were sampled from how many.

#### Scenario: Scatter that fits
- **WHEN** a scatter chart is drawn from a table of 12,000 rows with no missing values
- **THEN** the chart holds all 12,000 points and is not a sample

#### Scenario: Scatter too large to send whole
- **WHEN** a scatter chart is drawn from a table of 120,000 rows
- **THEN** the chart holds a sample that fits the limit, and the reply says how many of the
  120,000 points it shows

### Requirement: Plot replies
Plot's reply SHALL say, for each chart, what it shows and any rows left out or sampling. It SHALL list ignored charts with their reasons. When no chosen chart
is valid, the reply SHALL say so, list the ignored charts and add no component.

#### Scenario: No valid chart
- **WHEN** every chart the model chose names a column the table does not have
- **THEN** the reply has no `chart` component, lists each ignored chart with its reason,
  and does not fail

## REMOVED Requirements

### Requirement: Replies say what was shared
**Reason**: The closing line read as a debug message in every data reply. What the AI model
receives is still fixed by "What the model sees of the data" and is described in the README.
**Migration**: None. Replies no longer end with the "Shared with the AI model" line; the
model receives the same description as before.
