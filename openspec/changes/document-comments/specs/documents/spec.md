# Spec Delta

## MODIFIED Requirements

### Requirement: The document view
A document SHALL open across the whole main sheet under an editor header: a back link to the
view it was opened from, its title from the YAML header, a status line "Draft · <Project> ·
edited <time>", an Outline menu, Export PDF, and below them the source on the left and, on the
right, the preview or the comments panel. A Preview / Comments switch over the right pane SHALL
choose which it shows; the document SHALL open on the preview, and on the comments panel when it
is opened from a comment thread. The back link SHALL return to the view the document was opened
from.

#### Scenario: Opening from a Conversation
- **WHEN** the user opens a document from the Report panel of "Trial design" and clicks the
  "Trial design" back link
- **THEN** "Trial design" is shown again

#### Scenario: Switching to comments
- **WHEN** the user picks Comments over the right pane
- **THEN** the comments panel replaces the preview and the source keeps its width, and picking
  Preview shows the pages again
