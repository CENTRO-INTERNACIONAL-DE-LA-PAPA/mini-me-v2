# Spec Delta

## MODIFIED Requirements

### Requirement: Open an Asset
The user SHALL be able to open an attached Asset with the operating system's default
application for its type. A document (a `.qmd` Asset) SHALL instead open in the document view,
from an attachment and from its row in Files.

#### Scenario: Open an attachment
- **WHEN** the user clicks an attachment on a message
- **THEN** the file stored in the Project opens in the system's default application

#### Scenario: Open a document from Files
- **WHEN** the user clicks "Huancayo 2025 report.qmd" in Files
- **THEN** it opens in the document view, not in another application
