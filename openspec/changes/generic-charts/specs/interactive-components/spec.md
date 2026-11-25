# Spec Delta

## MODIFIED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component previews SHALL come only
from a Trait's adapter, through show-a-table, Plot's show-a-chart, write-a-document or the
provider adapter that owns the kind, or, for the `approval`, `hand-off` and `document` kinds,
from the Rust core, which adds a `document` card for a reply that made suggestions. Adding a
kind SHALL NOT need a change to the event protocol, the link protocol or the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1, `approval` version 1, `chart` version 2, `document` version 1, `hand-off`
  version 1 and `dataset-results` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind that a Trait's adapter adds has a renderer for the version it adds

#### Scenario: No Trait adds an approval
- **WHEN** a Trait call sends `component.add` with kind `approval`
- **THEN** the request fails with `component_not_allowed`

#### Scenario: No Trait adds document edits
- **WHEN** a Trait's model wants to change a document
- **THEN** it calls the suggest tool; no component kind holds edits

#### Scenario: No Trait adds a hand-off
- **WHEN** a Trait call sends `component.add` with kind `hand-off`
- **THEN** the request fails with `component_not_allowed`

### Requirement: Charts are drawn in a card
The UI SHALL draw a chart in a white bordered card with its title, the axes labelled with
their column names or the scale's label, and a legend when a colour scale shows a text or
boolean column. When a dataset was sampled, the card SHALL say "Sample of n of m points". A
mark with no colour SHALL be drawn in the `solid` colour of the Mini-Me that wrote the reply.
A colour scale of text or boolean values SHALL take that solid first, the theme's seven series
colours next and generated colours after them, so each value has its own colour. A colour the
description names SHALL be drawn as named.

#### Scenario: Plotter's chart
- **WHEN** Plotter's reply holds a histogram of `yield` with no colour channel
- **THEN** the bars are drawn in Plotter's solid colour on a white bordered card

#### Scenario: Sampled scatter
- **WHEN** a dataset carries `sample: { shown: 5000, total: 48210 }`
- **THEN** the card says "Sample of 5,000 of 48,210 points"

#### Scenario: Colour asked for
- **WHEN** the description gives a bar mark the fill `steelblue`
- **THEN** the bars are drawn in steel blue

### Requirement: Hovering shows exact values
When the pointer is over a shape that a mark drew from one row of a dataset, the UI SHALL show
a tooltip with that row's values for the columns the mark's channels show. Shapes that a mark
computes from many rows, such as a box or a density contour, and the rest of the chart SHALL
show no tooltip.

#### Scenario: Outlier above a box
- **WHEN** the user hovers an outlier dot drawn by a box mark
- **THEN** no tooltip shows, since the box mark computes its dots from many rows

#### Scenario: Dumbbell dot
- **WHEN** the user hovers the 2024 dot of "Yungay" in a dumbbell chart of mean `yield`
- **THEN** the tooltip shows `variety` "Yungay", `year` 2024 and its mean `yield`

#### Scenario: Hovering a bar
- **WHEN** the user hovers the bar for `variety` "Yungay" in a mean-of-`yield` bar chart
- **THEN** a tooltip shows "Yungay" and its mean `yield`

### Requirement: Showing and hiding series
Clicking a legend entry SHALL hide the rows that have that value in the colour scale's column,
in every mark coloured by that column, and clicking it again SHALL show them. At least one
value SHALL stay visible.

#### Scenario: Hiding a treatment
- **WHEN** the user clicks "Control" in the legend of a line chart coloured by `treatment`,
  which has three values
- **THEN** the "Control" line disappears and the other two stay

#### Scenario: Last series stays
- **WHEN** only one value is visible and the user clicks its legend entry
- **THEN** that value stays visible

### Requirement: Chart controls are not saved
A chart's controls SHALL only change what the UI shows. They SHALL add no event and send
nothing to the Rust core or the sidecar, so a chart is shown as it first appeared when its
Conversation is opened again.

#### Scenario: Reopening a Conversation
- **WHEN** the user hides a series, leaves the Conversation and opens it again
- **THEN** the chart shows every series

## ADDED Requirements

### Requirement: Chart preview
The preview of `chart` version 2 SHALL be `{ title, source, description, datasets }`.
`description` is the chart description as drawn, with only its valid parts. `datasets` maps
each dataset's name to its columns, each with a name and a type (number, text, date or
boolean), and its rows. A sampled dataset carries `sample: { shown, total }`.

#### Scenario: Chart with two datasets
- **WHEN** a component's description draws dots from a dataset of rows and a line from a
  dataset of means
- **THEN** the UI draws both marks in one figure, each from its own dataset

#### Scenario: Chart drawn before version 2
- **WHEN** a Conversation holds a `chart` version 1 component
- **THEN** the UI shows that component's text

### Requirement: Chart text
A chart's `text` SHALL describe it in plain words, complete enough to choose it again: its
title, its template with the column in each slot, its style slots, and the rows of each
dataset.

#### Scenario: Bar chart of means
- **WHEN** a chart is the bar template with `category` `variety`, `value` `yield`, aggregate
  mean and a log `y` scale
- **THEN** its text names the bar template, `variety`, `yield`, the mean and the log `y`
  scale

## REMOVED Requirements

### Requirement: Chart component
**Reason**: `chart` version 1 and its views are replaced by version 2, which holds a chart
description and its datasets.
**Migration**: See "Chart preview".

### Requirement: Switching views
**Reason**: A chart holds one description; alternative views are removed.
**Migration**: The user asks Plotter for another form of the chart in a follow-up.
