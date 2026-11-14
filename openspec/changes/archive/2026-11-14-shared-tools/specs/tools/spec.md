## MODIFIED Requirements

### Requirement: Adapters act through the tools
An adapter SHALL save files, show tables and charts and read files only through the tools,
never through `asset.write`, `component.add` or `asset.read` directly. The data Traits SHALL
read their tables through the read-a-table tool. An adapter that runs fixed code SHALL declare
the tools its code uses. A provider adapter (Find Papers, Theorize, Search CIP
Dataverse) SHALL save its results with the save-a-file tool as a hidden file, then add its
own component kind with that file as its source. The data and Asta Traits' replies and files
SHALL be the same as when they acted on their own, apart from their hidden files.

#### Scenario: Cleaned table
- **WHEN** Curator cleans `field-trial.csv`
- **THEN** `field-trial-cleaned.csv` is saved by the save-a-file tool and the tables are
  shown by the show-a-table tool, and the reply looks as it did before

#### Scenario: Papers
- **WHEN** Researcher finds 12 papers
- **THEN** its adapter saves them as a hidden JSON file and adds a `paper-sources` component
  whose `source_asset_id` is that file
