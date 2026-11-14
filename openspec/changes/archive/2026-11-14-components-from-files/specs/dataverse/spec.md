## MODIFIED Requirements

### Requirement: Search CIP Dataverse Trait
*Search CIP Dataverse* SHALL run on the `cip-dataverse` adapter. It SHALL ask the AI model
chosen in Settings for a search, `{ query, from_year, to_year }`, from the message, then search
CIP Dataverse's datasets through the core, save the first page of results as the hidden file
`datasets.json`, and show them as a `dataset-results` component with that file as its source,
with one line saying how many datasets matched. If the file can't be saved or the component is
rejected, the datasets SHALL be written as text instead. Like the data Traits, it SHALL need a
model chosen in Settings.

#### Scenario: A search
- **WHEN** the user sends "@CIP's Archivist late blight datasets from Peru since 2020"
- **THEN** the reply says how many datasets matched and shows them in a results card, with no
  attachment

#### Scenario: Nothing found
- **WHEN** no dataset matches
- **THEN** the reply says no datasets were found and suggests other keywords, with no component
  and no saved file
