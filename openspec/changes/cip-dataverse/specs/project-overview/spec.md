# Spec Delta

## MODIFIED Requirements

### Requirement: Output cards
Each output SHALL be a card with a thumbnail for its kind (table, chart, papers, theories,
datasets or file) tinted in the colour of the Mini-Me that made it with a bottom border in its solid
colour, the output's title, and "From <Conversation title>". Clicking a card SHALL open
its Conversation and scroll to the reply it came from.

#### Scenario: Curator's cleaned file
- **WHEN** Curator saved `trial-cleaned.csv` in "Huancayo 2025 trial data"
- **THEN** its card is tinted in Curator's colour and reads "trial-cleaned.csv" and
  "From Huancayo 2025 trial data"

#### Scenario: Opening a card
- **WHEN** the user clicks a chart's card
- **THEN** its Conversation opens scrolled to the reply that holds the chart

#### Scenario: Datasets CIP's Archivist found
- **WHEN** CIP's Archivist's reply showed 213 matching datasets
- **THEN** its card reads "213 datasets" with the Datasets icon
