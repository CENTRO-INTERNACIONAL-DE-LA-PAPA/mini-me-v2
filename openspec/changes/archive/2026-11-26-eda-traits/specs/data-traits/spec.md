# Spec Delta

## ADDED Requirements

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
