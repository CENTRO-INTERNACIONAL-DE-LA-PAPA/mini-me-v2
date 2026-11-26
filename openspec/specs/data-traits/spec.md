# data-traits Specification

## Purpose

Defines the data Traits: built-in Traits that run fixed tools over tabular Assets, which
files they read, what the AI model may see of the data, and what each Trait computes,
replies with and saves.

## Requirements

### Requirement: Tables a data Trait reads
A data Trait SHALL read, as tables, the Assets the message references with `#`, in the order
they appear in the message, then the Assets it attaches. CSV (`.csv`),
TSV (`.tsv`) and Excel (`.xlsx`) files are supported; the format
comes from the file name's extension. For a CSV or TSV the first row holds the column names.
For an Excel file, the Trait reads the sheet named in the message when one matches exactly,
and otherwise the first sheet, and its reply names the sheet it read. Files are
read through `asset.read` only, so Project-folder confinement holds, and an Asset larger
than 100 MiB is refused.

When the message points to no table, every data Trait except Join Data SHALL read one table
instead: the reply's picked file when it is a table file, and otherwise the newest table
file of the Conversation that is not hidden. Its reply SHALL start by naming that file and saying why it was
used. The Conversation's files are the Assets attached to or referenced by its messages, so
the fallback never reaches other files of the Project.

#### Scenario: CSV referenced
- **WHEN** the user sends "@Profiler #field-trial.csv"
- **THEN** Profiler reads `field-trial.csv` as a table

#### Scenario: Excel with several sheets
- **WHEN** the message references `harvest.xlsx`, which has the sheets "2024" and "2025",
  and does not name one
- **THEN** the Trait reads "2024" and its reply says it read the sheet "2024" of
  `harvest.xlsx`

#### Scenario: No table
- **WHEN** the message references no CSV, TSV or Excel file, there is no picked file, and
  the Conversation holds no table file
- **THEN** the reply fails with a message asking to reference a file with `#` or to attach a
  file

#### Scenario: Picked file
- **WHEN** Curator saved `field-trial-cleaned.csv` from `field-trial.csv`, the user sends
  "@Validator check the cleaned data", and Jev picks `field-trial-cleaned.csv`
- **THEN** Validator checks `field-trial-cleaned.csv`, and its reply says it used that file
  because the message seems to mean it

#### Scenario: Newest table of the Conversation
- **WHEN** a message tagged `harvest.csv`, the user then sends "@Plotter compare average
  yield by variety", and there is no picked file
- **THEN** Plot draws from `harvest.csv`, and its reply says it used that file because it
  is the newest table in the Conversation

#### Scenario: Picked file is not a table
- **WHEN** the picked file is `notes.txt` and the Conversation holds `harvest.csv`
- **THEN** the Trait reads `harvest.csv` as the newest table of the Conversation

#### Scenario: Newest table after a profile
- **WHEN** Profiler profiled `field-trial.csv`, saving its column table as a hidden file, and
  the user sends "@Plotter plot yield by variety" with no reference and no picked file
- **THEN** Plot draws from `field-trial.csv`, not from the hidden column table

#### Scenario: Join Data needs both tables tagged
- **WHEN** the user sends "@Linker join the two tables" without references
- **THEN** Join Data fails as before, asking for the tables to be referenced

#### Scenario: Unreadable file
- **WHEN** a referenced `.csv` cannot be parsed as a table
- **THEN** the reply fails with a message naming the file and what could not be read

#### Scenario: Table referenced
- **WHEN** an earlier reply showed a preview of 500 of 12,340 rows of
  `field-trial-cleaned.csv` and the user sends "@Plotter plot #field-trial-cleaned.csv"
- **THEN** Plot draws from all 12,340 rows of `field-trial-cleaned.csv`

#### Scenario: File and table in order
- **WHEN** the user sends "@Linker join #plots.csv with #harvest.csv"
- **THEN** Join Data reads `plots.csv` first and `harvest.csv` second

#### Scenario: Chart referenced
- **WHEN** Plotter drew "Yield by variety" from `field-trial.csv` and the user sends
  "@Profiler profile the data behind the yield chart" without a reference
- **THEN** Profiler profiles the reply's picked file, which Jev picks from the file options
  that name the chart

### Requirement: What the model sees of the data
When a data Trait asks the AI model to choose checks, actions or keys, it SHALL send the
user's message and a description of each table: its file name, row count, and for each
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

### Requirement: Profile Data Trait
The Trait library SHALL contain *Profile Data*, which reports, for each table it reads, the
row and column counts, the number of duplicate rows, and for each column its type, missing
values (count and percentage), distinct values, and minimum and maximum when numeric or a
date. It SHALL use no AI model and send nothing outside the machine. Its reply is a short
text summary and a `table` component with one row per column.

#### Scenario: Profiling a field trial
- **WHEN** the user sends "@Profiler #field-trial.csv" for a file of 240 rows and 12
  columns with 3 duplicate rows
- **THEN** the reply says it has 240 rows, 12 columns and 3 duplicate rows, and shows a
  table with one row per column giving its type, missing values, distinct values and range

#### Scenario: Works without a model
- **WHEN** no AI model is set in Settings and the user asks Profiler to profile a file
- **THEN** Profiler answers normally

### Requirement: Validate Data Trait
The Trait library SHALL contain *Validate Data*, which runs, on each table it reads, the
default checks (no column is entirely empty; no row is duplicated) and the checks the model
chooses from this catalogue to match the user's message: not-null, unique key (one or more
columns), numeric range, allowed values, text pattern, and column type. Checks SHALL run
with pointblank.

#### Scenario: Rules from the message
- **WHEN** the user sends "@Validator #field-trial.csv plot_id must be unique and yield
  between 0 and 80"
- **THEN** the reply's table lists the default checks, a unique-key check on `plot_id` and
  a range check on `yield` from 0 to 80, each with its passed and failed rows

#### Scenario: Only defaults
- **WHEN** the message names no rule
- **THEN** only the default checks run

### Requirement: Validation results
*Validate Data*'s reply SHALL list every check run with its column, the rows that passed
and failed, and its result, as a `table` component, and say how many checks failed. It
SHALL attach pointblank's report as `<file>-validation.html`.

#### Scenario: Failed checks counted
- **WHEN** two of five checks fail
- **THEN** the reply says two checks failed, the table marks them, and
  `field-trial-validation.html` is attached

### Requirement: Clean Data Trait
The Trait library SHALL contain *Clean Data*, which applies to one table the cleaning
actions the model chooses from this list, in the order given: trim whitespace, normalise
missing-value codes to empty, change letter case, cast a column to a type, map values,
replace by a regular expression, drop duplicate rows, drop rows matching a condition, clip
to a range, fill missing values, rename columns, and sort. It SHALL save the result as a new
Asset named `<name>-cleaned.<ext>` in the input's format and SHALL NOT change the input.
Its reply lists each action applied with the number of cells or rows it changed, and shows
a preview of the cleaned table as a `table` component.

#### Scenario: Cleaning a field trial
- **WHEN** the user sends "@Curator #field-trial.csv fix the variety spellings and remove
  duplicate rows"
- **THEN** the reply lists a value mapping on `variety` and the dropped duplicates with
  their counts, `field-trial-cleaned.csv` is attached, and `field-trial.csv` is unchanged

### Requirement: Destructive cleaning is held back
*Clean Data* SHALL NOT apply an action that would remove more than half of the table's
rows, and its reply SHALL say which action was held back and why.

#### Scenario: Destructive action held back
- **WHEN** a chosen action would drop 70% of the rows
- **THEN** it is not applied, and the reply says which action was held back and why

### Requirement: Join Data Trait
The Trait library SHALL contain *Join Data*, which joins the first two tables it reads on
key columns, using the join type the user asks for (inner, left, right or outer; left by
default). The model chooses the keys and join type from the message and the two tables'
column names; it sees no values. When no AI model is set and the tables share exactly one
column name, that column is the key.

#### Scenario: Keys without a model
- **WHEN** no AI model is set and both tables have one shared column, `plot_id`
- **THEN** the tables are joined on `plot_id`

### Requirement: Join results
*Join Data* SHALL save the result as `<first>-joined.csv`. Its reply SHALL give the row
counts of both inputs and of the result, the number of keys in each table without a match,
and a preview of the result as a `table` component.

#### Scenario: Joining harvest to plots
- **WHEN** the user sends "@Linker join #harvest.csv to #plots.csv by plot_id"
- **THEN** the reply gives the row counts, the keys without a match in each table, and a
  preview, and `harvest-joined.csv` is attached

#### Scenario: Fewer than two tables
- **WHEN** the message references only one table
- **THEN** the reply fails with a message asking for two tables

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

#### Scenario: Named column that doesn't fit
- **WHEN** the user asks Plotter for "a box plot of variety by site"
- **THEN** no chart is drawn with another column in place of `variety`; the reply says
  `variety` is a text column and the value slot needs numbers, and suggests a count bar chart
  of `site` grouped by `variety`

#### Scenario: Unreadable answer
- **WHEN** the model answers Plot without choosing any chart
- **THEN** the reply says the model's answer could not be used and suggests templates that
  fit the table's columns, and the reply does not fail

#### Scenario: What was drawn
- **WHEN** Plot draws a scatter of `yield` against `blight` with no group
- **THEN** the reply's line for it names the scatter template, its `x` and `y` columns and
  "no group"

#### Scenario: Ignored scale
- **WHEN** the model asks for a log `y` scale on a chart whose `y` values include 0
- **THEN** the chart is drawn with a linear `y` scale, and the reply lists the log scale as
  ignored

### Requirement: Stopping a data reply ends its work
A data Trait's computations, including reading its tables, SHALL run outside the sidecar's
main process, in a worker the sidecar can end. When the run is cancelled, the sidecar SHALL
end the worker of each of the run's calls within one second and end the run with
`run.cancelled`. Workers SHALL read and write no file and SHALL end when the sidecar ends.

#### Scenario: Stopping a long validation
- **WHEN** the user stops a *Validate Data* reply on a 100 MiB table while its checks run
- **THEN** the reply ends as cancelled and the computation stops within one second

#### Scenario: The next data reply after a stop
- **WHEN** the user sends a *Profile Data* request right after stopping a data reply
- **THEN** it runs and completes as usual

### Requirement: Data work does not hold up other replies
Reading and computing over a table SHALL NOT block the sidecar from handling other runs, so
replies of other Conversations keep streaming while a data Trait works.

#### Scenario: Profiling while another reply streams
- **WHEN** *Profile Data* reads a 100 MiB table while a Mini-Me's reply streams in another
  Conversation
- **THEN** the other reply keeps streaming without pausing

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
and SHALL be listed with the reason. Slots the template does not have SHALL be ignored. An
optional slot left empty SHALL leave out the parts of the chart that use it.

#### Scenario: Text column for a value
- **WHEN** the model fills a bar template's `value` slot with `variety`, a text column
- **THEN** that chart is not drawn, and the reply says `variety` is a text column and the
  slot needs numbers

#### Scenario: Optional group left empty
- **WHEN** the model answers with the line template and no `group`
- **THEN** the chart draws one line, not one per group

### Requirement: Slot types
A slot SHALL accept every column type its chart can draw there: number or date for positions
of rows and binned values, number for aggregated or statistical values, and text, boolean or
number for groups and categories. A number column a chart colours by SHALL be drawn as
categories, with a legend, not along a scale.

#### Scenario: Dates on a scatter
- **WHEN** the model fills a scatter template's `x` with `date`, a date column, and `y` with
  `price`
- **THEN** the chart draws one dot per row over time

#### Scenario: Number group
- **WHEN** a scatter is coloured by `block`, a number column holding 1 to 4
- **THEN** the dots take four category colours and the legend lists 1, 2, 3 and 4

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

### Requirement: Exploring Traits choose columns and options
*Describe Variables*, *Find Correlations*, *Detect Outliers* and *Find Clusters* SHALL read the
first table they read, have the model choose from the message the columns to use and the
Trait's options, and use every column of a fitting type when the message names none. A named
column of a type the Trait cannot use SHALL be left out and listed with the reason. Each needs
an AI model.

#### Scenario: Columns named in the message
- **WHEN** the user's message asks for correlations between `yield`, `height` and `tubers`
- **THEN** *Find Correlations* uses only those three columns

#### Scenario: No columns named
- **WHEN** the message names no column and the table has five number columns
- **THEN** *Find Correlations* uses all five

#### Scenario: Text column named
- **WHEN** the message asks *Detect Outliers* to check `variety`, a text column, and `yield`
- **THEN** it checks `yield`, and the reply lists `variety` as left out because it is not a
  number column

#### Scenario: No model set
- **WHEN** no AI model is set in Settings and the user's message reaches *Describe Variables*
- **THEN** the reply fails with "Choose an AI model in Settings first."

### Requirement: Exploring Traits draw from the chart templates
The charts of *Describe Variables*, *Find Correlations*, *Detect Outliers* and *Find Clusters*
SHALL be drawn from the built-in chart templates, with their data computed as *Plot*'s are,
including leaving out rows with missing values and sampling only to fit the size limit. Each
SHALL record the table file it was drawn from as *Plot*'s charts do.

#### Scenario: Histogram from a template
- **WHEN** *Describe Variables* draws the distribution of `yield` from `field-trial.csv`
- **THEN** the reply holds a `chart` component drawn from the histogram template whose
  source is `field-trial.csv`

### Requirement: Describe Variables Trait
The Trait library SHALL contain *Describe Variables*, which describes each chosen column by its
type: for number columns the count, mean, standard deviation, minimum, quartiles, maximum and
skewness; for text and boolean columns the distinct values and the most frequent value with its
share; for date columns the first and last date and the span. Missing values are counted for
every column.

#### Scenario: Describing a field trial
- **WHEN** the user's message reaches *Describe Variables* for `field-trial.csv` with the
  number columns `yield` and `height` and the text column `variety`
- **THEN** the reply shows a `table` component for the number columns and one for the text
  column, with the statistics above

### Requirement: Describe Variables replies
*Describe Variables*' reply SHALL say how many number, text, boolean and date columns it
described, show one `table` component per column type present, and draw a histogram for each
number column and a count bar chart for each text or boolean column with at most 30 distinct
values, up to 8 charts in all, saying which columns it did not chart.

#### Scenario: Many columns
- **WHEN** the table has 12 number columns and the message names none
- **THEN** the reply describes all 12, draws 8 histograms, and names the 4 columns it did not
  chart

#### Scenario: Column with many categories
- **WHEN** a text column `plot_id` has 400 distinct values
- **THEN** it is described but not charted, and the reply says it has too many distinct
  values to chart

### Requirement: Find Correlations Trait
The Trait library SHALL contain *Find Correlations*, which computes the pairwise correlation of
the chosen number columns with the method the model chooses, Pearson or Spearman (Pearson by
default), and for each pair the coefficient, the number of rows with both values, and the
p-value. With fewer than two number columns it replies that there is nothing to correlate.

#### Scenario: Spearman asked for
- **WHEN** the user asks for rank correlations of `yield` and `rainfall`
- **THEN** the model chooses Spearman, and the reply's table gives their Spearman coefficient

#### Scenario: One number column
- **WHEN** the chosen columns hold only one number column
- **THEN** the reply says correlations need at least two number columns, has no component, and
  does not fail, so a Workflow goes on to its next Step

### Requirement: Correlation results
*Find Correlations*' reply SHALL show a `table` component with one row per pair, sorted by the
coefficient's absolute value, strongest first; a correlation heatmap of the chosen columns; and
a scatter chart with a trend line for each of the three strongest pairs. Its text SHALL name
the strongest pairs with their coefficients, and say that a correlation does not show cause.

#### Scenario: Strongest pairs
- **WHEN** `yield` and `tubers` have the strongest correlation, 0.81
- **THEN** the table's first row is that pair, the text names it with 0.81, and the first
  scatter chart draws `yield` against `tubers` with a trend line

### Requirement: Detect Outliers Trait
The Trait library SHALL contain *Detect Outliers*, which flags, for each chosen number column,
the values outside its quartiles by more than a multiple of the interquartile range that the
model chooses, 1.5 by default or 3, and, when two or more number columns are chosen, the rows
that an Isolation Forest finds unusual across those columns. With no number column it replies
that there is nothing to check.

#### Scenario: No number column
- **WHEN** the table has only text and date columns
- **THEN** the reply says there are no number columns to check, and does not fail

#### Scenario: Extreme outliers only
- **WHEN** the user asks for extreme outliers
- **THEN** the model chooses a multiple of 3, and only values beyond three interquartile ranges
  are flagged

### Requirement: Outlier results
*Detect Outliers*' reply SHALL show a `table` component with one row per column giving its
bounds and how many values fall outside them, a `table` component of the flagged rows with the
reason each was flagged, and a box plot of the columns with flagged values. It SHALL NOT change
the table or save a new table file.

#### Scenario: Flagged rows
- **WHEN** 3 values of `yield` are above its upper bound and the Isolation Forest flags 5 rows
- **THEN** the reply says so, and the flagged rows table lists each row with its reason, and
  `field-trial.csv` is unchanged

### Requirement: Find Clusters Trait
The Trait library SHALL contain *Find Clusters*, which groups the rows by the chosen number
columns, scaled to a common range, with the method the model chooses: k-means, with the number
of clusters the model chooses or else the one from 2 to 8 that separates the rows best, or
HDBSCAN. Rows missing a value in a chosen column are not clustered. It needs at least two
number columns.

#### Scenario: Number of clusters chosen by the user
- **WHEN** the user asks for 4 clusters
- **THEN** the rows are grouped into 4 clusters with k-means

#### Scenario: Number of clusters left open
- **WHEN** the message names no number of clusters
- **THEN** k-means tries 2 to 8 clusters, keeps the one that separates the rows best, and the
  reply says how many it kept and why

#### Scenario: Large table
- **WHEN** the model chooses HDBSCAN for a table of more than 20,000 rows
- **THEN** the rows are clustered with k-means instead, and the reply says why

### Requirement: Cluster results
*Find Clusters*' reply SHALL show a `table` component with one row per cluster giving its size
and the mean of each chosen column, and a scatter chart of the first two principal components
coloured by cluster, naming the share of variation they explain. It SHALL save the table as a
new Asset `<name>-clusters.csv` with the columns `cluster`, `pc1` and `pc2` added, and SHALL NOT
change the input.

#### Scenario: Clusters saved
- **WHEN** *Find Clusters* groups `field-trial.csv` into 3 clusters
- **THEN** `field-trial-clusters.csv` is attached with a `cluster` column, rows that were not
  clustered have no `cluster` value, and `field-trial.csv` is unchanged

#### Scenario: Plotting the clusters later
- **WHEN** the user then sends "@Plotter #field-trial-clusters.csv yield by cluster"
- **THEN** *Plot* draws from the saved file with `cluster` as a column
