# Spec Delta

## ADDED Requirements

### Requirement: Featuring a component on the Overview
A chart or table component in a reply SHALL have a "Feature on Overview" button. Featuring it
SHALL make it the Project's featured component, replacing any other, and the button SHALL
show it is featured while it is. Clicking it again SHALL remove it from the Overview. Other
kinds SHALL NOT have the button.

#### Scenario: Featuring a chart
- **WHEN** the user clicks "Feature on Overview" on Plotter's chart
- **THEN** that chart becomes the Project's featured output and its button shows it is
  featured

#### Scenario: Featuring another
- **WHEN** a table is featured and the user features a chart in another reply
- **THEN** the chart replaces the table on the Overview, and the table's button no longer
  shows it as featured

#### Scenario: Paper sources
- **WHEN** a reply holds a paper sources component
- **THEN** it has no "Feature on Overview" button
