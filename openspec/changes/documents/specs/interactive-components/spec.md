# Spec Delta

## ADDED Requirements

### Requirement: Document component
The `document` kind, version 1, SHALL hold `{ asset_id, title }` and show a card below the
reply with the document's title, a document icon and an Open button that opens it in the
document view. A card whose document no longer exists SHALL say it was removed.

#### Scenario: Opening from a reply
- **WHEN** the user clicks Open on the document card of Scribe's reply
- **THEN** the document opens in the document view

#### Scenario: Document deleted
- **WHEN** the card's `.qmd` Asset has been removed
- **THEN** the card says the document was removed and offers no Open
