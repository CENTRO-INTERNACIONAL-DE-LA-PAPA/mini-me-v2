# Spec Delta

## MODIFIED Requirements

### Requirement: The document view
A document SHALL open across the whole main sheet under an editor header: a back link to the
view it was opened from, its title from the YAML header, a status line "Draft · <Project> ·
edited <time>", a Comments button, Export PDF, and below them the source and the preview side by
side. The Comments button SHALL show or hide the Comments sheet beside the main sheet.
The back link SHALL return to the view the document was opened from.

#### Scenario: Opening from a Conversation
- **WHEN** the user opens a document from the Report panel of "Trial design" and clicks the
  "Trial design" back link
- **THEN** "Trial design" is shown again

#### Scenario: Showing the comments
- **WHEN** the user clicks Comments
- **THEN** the Comments sheet appears beside the main sheet, and clicking Comments again hides
  it

## REMOVED Requirements

### Requirement: The outline
**Reason**: The Outline menu's place in the editor header goes to the Comments button, and the
sheet it opens lists comment threads rather than headings.
**Migration**: None; headings stay visible in the source, and Quarto editors offer their own
outline.
