# Spec Delta

## MODIFIED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component data SHALL come only
from the adapters of built-in Traits that list the kind, or, for the `approval` kind, from
the Rust core. Adding a kind SHALL NOT need a change to the event protocol, the link
protocol or the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1, `theories` version 1, `table`
  version 1, `approval` version 1 and `chart` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind a built-in Trait lists has a renderer for version 1

#### Scenario: No Trait adds an approval
- **WHEN** a Trait call sends `component.add` with kind `approval`
- **THEN** the request fails with `component_not_allowed`

## ADDED Requirements

### Requirement: Chart component
The data of `chart` version 1 SHALL be `{ title, views }`, with one or more views. Each view
has a `type` (`histogram`, `bar`, `line`, `scatter`, `box` or `heatmap`), the columns it
uses with their names and types, and the values its type needs. A view with series lists
them in order. A line or scatter view that was sampled carries `sample: { shown, total }`.

#### Scenario: Chart with two views
- **WHEN** a component holds a histogram view and a box view of `yield`
- **THEN** the UI draws the histogram first and offers the box view

### Requirement: Charts are drawn in a card
The UI SHALL draw a chart in a white bordered card with its title, the axes labelled with
their column names, and a legend when the view has series. When a view was sampled, the
card SHALL say "Sample of n of m points". The chart SHALL use the theme's chart tokens, its
first series SHALL be drawn in the `solid` colour of the Mini-Me that wrote the reply, the
next seven in the theme's series colours, and any further ones in generated colours, so
each series of a view has its own colour.

#### Scenario: Plotter's chart
- **WHEN** Plotter's reply holds a histogram of `yield` with no series
- **THEN** the bars are drawn in Plotter's solid colour on a white bordered card

#### Scenario: Sampled scatter
- **WHEN** a scatter view carries `sample: { shown: 5000, total: 48210 }`
- **THEN** the card says "Sample of 5,000 of 48,210 points"

### Requirement: Hovering shows exact values
When the pointer is over a point, bar, box or cell of a chart, the UI SHALL show a tooltip
with that shape's exact values: its column names and values, and its series when there is
one. Elsewhere on the chart, no tooltip SHALL show.

#### Scenario: Outlier above a box
- **WHEN** the user hovers an outlier dot drawn above a box
- **THEN** the tooltip shows that outlier's value, not the box's statistics

#### Scenario: Hovering a bar
- **WHEN** the user hovers the bar for `variety` "Yungay" in a mean-of-`yield` bar chart
- **THEN** a tooltip shows "Yungay" and its mean `yield`

### Requirement: Showing and hiding series
Clicking a legend entry SHALL hide that series, and clicking it again SHALL show it. At least
one series SHALL stay visible.

#### Scenario: Hiding a treatment
- **WHEN** the user clicks "Control" in the legend of a line chart with three treatments
- **THEN** the "Control" line disappears and the other two stay

#### Scenario: Last series stays
- **WHEN** only one series is visible and the user clicks its legend entry
- **THEN** that series stays visible

### Requirement: Switching views
When a chart has more than one view, the UI SHALL show a toggle with one button per view,
named by its type. Choosing one SHALL draw that view.

#### Scenario: Switching to the box plot
- **WHEN** the user chooses "Box" on a chart whose first view is a histogram
- **THEN** the chart is drawn as the box view

### Requirement: Chart controls are not saved
A chart's controls SHALL only change what the UI shows. They SHALL add no event and send
nothing to the Rust core or the sidecar, so a chart is shown as it first appeared when its
Conversation is opened again.

#### Scenario: Reopening a Conversation
- **WHEN** the user hides a series, leaves the Conversation and opens it again
- **THEN** the chart shows its first view with every series
