# Spec Delta

## MODIFIED Requirements

### Requirement: The model only chooses from fixed lists
A data Trait SHALL ask the model for a structured answer naming entries of a fixed catalogue
of checks, actions or chart templates with their parameters, and SHALL ignore any entry that is not in the catalogue, names a column the table
or dataset does not have, has invalid parameters, or does not fit its kind's schema, listing
what it ignored in the reply and still using the other entries. The
data Trait, not the model, SHALL compute every number, check result, table and chart value it
reports. When no AI model is set in Settings, a data Trait that needs one fails with the
message "Choose an AI model in Settings first."

#### Scenario: Invented check ignored
- **WHEN** the model's answer for Validate Data includes a check on a column `yeild` that
  the table does not have
- **THEN** that check is not run, and the reply lists it as ignored

#### Scenario: Invented chart ignored
- **WHEN** the model's answer for Plot fills a scatter template's `y` slot with a column
  `heigth` that the table does not have
- **THEN** that chart is not drawn, and the reply lists it as ignored with the reason

#### Scenario: Malformed action ignored
- **WHEN** the model's answer for Clean Data has a `map_values` action with `columns` in
  place of `column`, and a well-formed `strip_whitespace` action
- **THEN** the whitespace is stripped, and the reply lists the `map_values` action as not run
  because it has no `column`

#### Scenario: Malformed chart ignored
- **WHEN** the model's answer for Plot has one chart with no `title` and one well-formed chart
- **THEN** the well-formed chart is drawn, and the reply lists the other as not drawn with the
  reason

### Requirement: Plot Trait
The Trait library SHALL contain *Plot*, which draws charts of the first table it reads. For
each chart that answers the user's message, the model chooses a chart template and fills its
slots, and Plot draws every chart whose slots fit the table. It reads further tables only to say in the
reply that they were not used. Its reply is a short text and one `chart` component per chart,
with no `table` component.

#### Scenario: Yield distribution
- **WHEN** the user sends "@Plotter #field-trial.csv show me how yield is distributed"
- **THEN** the reply holds a `chart` component showing a histogram of `yield` and no `table`
  component

#### Scenario: Several tables referenced
- **WHEN** the message references `harvest.csv` and `plots.csv`
- **THEN** Plot draws from `harvest.csv`, and the reply says `plots.csv` was not used

#### Scenario: No model set
- **WHEN** no AI model is set in Settings and the user asks Plotter for a chart
- **THEN** the reply fails with "Choose an AI model in Settings first."

### Requirement: What a chart's data holds
Plot SHALL compute each dataset's rows with pandas from every row of the table, running its
data operations in order. A dataset SHALL hold only the columns that the chart's marks use.
Rows missing a value in a column a mark uses SHALL be left out of that dataset, and the reply
SHALL say how many were left out.

#### Scenario: Missing values left out
- **WHEN** a chart draws dots of `yield` against `height` from a table where 12 rows have no
  `yield`
- **THEN** the dataset leaves those rows out, and the reply says 12 rows had missing values

#### Scenario: Correlation heatmap
- **WHEN** the model describes a dataset that correlates `yield`, `height` and `tubers`
- **THEN** the dataset holds the nine pairwise correlations of those columns

### Requirement: A chart records its file
Each chart Plot draws SHALL record the table file it was drawn from as the component's
`source_asset_id`, and that file's name as `source` in its preview. The preview SHALL hold no
rows of the file beyond the rows of its datasets.

#### Scenario: Drawn from a file
- **WHEN** Plot draws "Yield by variety" from `field-trial.csv`
- **THEN** the chart's `source_asset_id` is the ID of `field-trial.csv`, and its preview's
  `source` is `field-trial.csv`

#### Scenario: Drawn from a referenced table
- **WHEN** an earlier reply previewed `field-trial.csv` and Plot draws from
  `#field-trial.csv`
- **THEN** the chart records `field-trial.csv`

### Requirement: Points are sampled only to fit the size limit
A dataset whose rows are the table's own rows, with no group, bin or correlate operation,
SHALL hold every row while the chart's data fits the core's component size limit. Only when it
does not SHALL Plot keep a random sample of those rows, as large as fits and the same each time
it charts the same table, and the reply SHALL say how many rows were sampled from how many. A
grouped, binned or correlated dataset is never sampled; when it does not fit, the chart is
described in text instead.

#### Scenario: Scatter that fits
- **WHEN** a chart draws dots from a table of 12,000 rows with no missing values
- **THEN** the dataset holds all 12,000 rows and is not a sample

#### Scenario: Scatter too large to send whole
- **WHEN** a chart draws dots from a table of 120,000 rows
- **THEN** the dataset holds a sample that fits the limit, and the reply says how many of
  the 120,000 rows it shows

#### Scenario: Too many groups
- **WHEN** a chart draws bars of a dataset grouped by a column with 400,000 distinct values
- **THEN** no `chart` component is added, and the reply describes the chart in text

### Requirement: Plot replies
Plot's reply SHALL say, for each chart, what it shows and any rows left out or sampling. It
SHALL list ignored charts and ignored parts of drawn charts with their reasons. When no chart
has a valid mark, the reply SHALL say so, list what it ignored and add no component.

#### Scenario: No valid chart
- **WHEN** every chart the model chose fills a slot with a column the table does not have
- **THEN** the reply has no `chart` component, lists each ignored chart with its reason, and
  does not fail

#### Scenario: Suggestions for a chart not drawn
- **WHEN** the model fills a box template's `value` slot with `variety`, a text column
- **THEN** the chart is not drawn, and the reply names the table's number columns that fit
  the slot and templates that can show `variety`

#### Scenario: Unreadable answer
- **WHEN** the model answers Plot without choosing any chart
- **THEN** the reply says the model's answer could not be used and suggests templates that
  fit the table's columns, and the reply does not fail

#### Scenario: Ignored scale
- **WHEN** the model asks for a log `y` scale on a chart whose `y` values include 0
- **THEN** the chart is drawn with a linear `y` scale, and the reply lists the log scale as
  ignored

## ADDED Requirements

### Requirement: Chart templates
Each chart type SHALL be a template shipped with the app: a name, a one-line description, its
slots with the column types each accepts and whether it is required, and the chart it draws,
built from data operations, marks and scales with gaps for its slots. The model SHALL be given
every template's name, description and slots, and SHALL answer with a template's name, a
title, its slots and the style slots.

#### Scenario: Dumbbell chart
- **WHEN** the user asks Plotter for the mean yield of each variety in Season 2023 and Season
  2024
- **THEN** the model answers with the dumbbell template, `category` `variety`, `group`
  `season`, `value` `yield` and `aggregate` mean, and the chart joins each variety's two
  means with a rule and marks them with dots coloured by `season`

#### Scenario: Unknown template
- **WHEN** the model answers with a template name that no template has
- **THEN** that chart is not drawn, and the reply lists it as ignored with the reason

### Requirement: Template slots
Plot SHALL check each filled slot against the table: the column exists and has a type the slot
accepts. A chart with a required slot empty, or a slot that does not fit, SHALL NOT be drawn
and SHALL be listed with the reason. A slot SHALL accept every column type its chart can draw
there: number or date for positions of rows and binned values, number for aggregated or
statistical values, and text, boolean or number for groups and categories. Slots the template does not have SHALL be ignored. An
optional slot left empty SHALL leave out the parts of the chart that use it.

#### Scenario: Text column for a value
- **WHEN** the model fills a bar template's `value` slot with `variety`, a text column
- **THEN** that chart is not drawn, and the reply says `variety` is a text column and the
  slot needs numbers

#### Scenario: Dates on a scatter
- **WHEN** the model fills a scatter template's `x` with `date`, a date column, and `y` with
  `price`
- **THEN** the chart draws one dot per row over time

#### Scenario: Optional group left empty
- **WHEN** the model answers with the line template and no `group`
- **THEN** the chart draws one line, not one per group

### Requirement: Style slots
Every template SHALL accept the same style slots: a colour or colour scheme the user names, a
log scale for `x` or `y`, a reference line at a value, a height, a sort order of categories
(by value or by name), and a facet column that draws one panel per value. The colour of a
chart without a colour slot SHALL be the app's own.

#### Scenario: Reference line
- **WHEN** the user asks for a line at 20 t/ha on a bar chart of mean `yield`
- **THEN** the model fills the reference slot with 20, and the chart draws a rule at 20

#### Scenario: One panel per site
- **WHEN** the user asks for mean `yield` by `variety` with one panel per `site`
- **THEN** the model fills the facet slot with `site`, and the chart has one panel per site

### Requirement: Chart data operations
A dataset SHALL be built from the table only by these data operations, run in order: filter
rows by a column's value; group by columns with aggregates (count, sum, mean, median, min,
max or standard deviation); bin a number or date column; correlate number columns pairwise;
unpivot columns into name and value columns; sort by columns; keep the first N rows.

#### Scenario: Counts per category
- **WHEN** a template's dataset groups by `variety` with a count
- **THEN** it holds one row per value of `variety` with the number of rows of that value

### Requirement: Allowed marks
A template's marks SHALL be Observable Plot marks other than `geo`, `graticule`, `sphere` and
`image`. Marks that compute statistics of their rows, such as box, density or linear
regression, SHALL draw from a dataset of the table's own rows.

#### Scenario: Template format
- **WHEN** the app's tests run
- **THEN** every template loads, and uses only allowed marks and its own slots

#### Scenario: Box plot from sampled rows
- **WHEN** a box mark draws `yield` by `variety` from a dataset that was sampled
- **THEN** the reply says the box plot was drawn from a sample of the rows

### Requirement: Built-in templates
The app SHALL ship templates for at least histogram, bar, count bar, stacked bars, grouped
bars, lollipop, range bars, line, area, stacked area, slope, dumbbell, scatter, scatter with a
trend line, box, density, ridgeline, correlation heatmap and waffle charts. Adding a chart
type SHALL need only a new template.

#### Scenario: Asking for a chart type by name
- **WHEN** the user asks Plotter for a lollipop chart of mean `yield` by `variety`
- **THEN** the model answers with the lollipop template, and the chart has a rule and a dot
  for each variety

### Requirement: Follow-up charts
When the reply's picked component is a chart, Plot SHALL give the model that chart's text
along with the message and the table's description, so that the new chart can be based on it.
The new chart is a new component in the new reply; the earlier chart is unchanged. With no
picked chart, the model chooses a new chart from the message alone.

#### Scenario: Log scale
- **WHEN** Plotter drew a scatter of `yield` against `height` and the user then sends
  "@Plotter use a log scale for yield" and Jev picks that chart
- **THEN** the new reply holds a scatter of the same columns with a log `y` scale, and the
  scatter in the earlier reply is unchanged

#### Scenario: No picked chart
- **WHEN** the Conversation has a chart of `yield`, the user sends "@Plotter #weather.csv
  chart the rainfall per month" and Jev picks no component
- **THEN** Plot draws from `weather.csv` a new chart of rainfall per month

## REMOVED Requirements

### Requirement: Chart catalogue
**Reason**: Chart types are templates shipped as data, each built from marks, scales and
data operations, so a new type needs no code.
**Migration**: The six types are chart templates, alongside new ones; see "Chart templates",
"Template slots" and "Built-in templates".

### Requirement: Chart series
**Reason**: Series are a template's `group` slot, which colours its marks by a column.
**Migration**: See "Template slots".

### Requirement: Alternative views
**Reason**: Each chart is one template; another form of the same data is asked for in a
follow-up.
**Migration**: The user asks Plotter to change the chart; see "Follow-up charts".
